import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { FlightOpsService } from 'src/modules/flight-ops/flight-ops.service';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { OutboxService } from 'src/platform/events/outbox.service';
import { OutboxRelayService } from 'src/platform/events/outbox-relay.service';
import { resolveImageOpsResource } from './image-ops-resource-resolver';
import {
  ensureMissionCompletionBatch,
  listReadableMediaBatches,
} from './image-ops-read-helpers';
import { MediaBatch, MediaBatchDocument } from './media-batch.schema';
import { Sample, SampleDocument } from './sample.schema';

@Injectable()
export class ImageOpsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(MediaBatch.name)
    private readonly mediaBatchModel: HydratedModel<MediaBatchDocument>,
    @InjectModel(Sample.name)
    private readonly sampleModel: HydratedModel<SampleDocument>,
    private readonly flightOpsService: FlightOpsService,
    private readonly projectsService: ProjectsService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly outboxRelayService: OutboxRelayService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
    this.outboxRelayService.registerHandler({
      consumerName: 'image-ops.mission-completed',
      supports: (eventType) => eventType === 'MissionPilotCompleted.v1',
      handle: (event) =>
        this.handleMissionCompletedEvent({
          organizationId: String(event.organizationId),
          projectId: String(event.projectId),
          missionId: String(event.missionId),
          completedBy: String(event.actorId),
        }),
    });
  }

  supports(resourceType: string): boolean {
    return resourceType === 'MEDIA_BATCH' || resourceType === 'SAMPLE';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    return resolveImageOpsResource(
      {
        mediaBatchModel: this.mediaBatchModel,
        sampleModel: this.sampleModel,
        projectsService: this.projectsService,
      },
      reference,
    );
  }

  async handleMissionCompletedEvent(event: {
    organizationId: string;
    projectId: string;
    missionId: string;
    completedBy: string;
  }) {
    await ensureMissionCompletionBatch(this.mediaBatchModel, event);
  }

  async ingestMediaBatch(
    principal: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      missionId: string;
      projectId: string;
      key: string;
    },
  ) {
    const project = await this.projectsService.findById(input.projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    const mission = await this.flightOpsService.getMission(input.missionId);
    if (
      mission.projectId !== project.id ||
      mission.organizationId !== project.organizationId ||
      project.organizationId !== input.organizationId
    ) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Mission does not belong to the requested project or organization',
      );
    }

    return this.transactionManagerService.runInTransaction(async (session) => {
      const mediaBatch = await this.mediaBatchModel.findOneAndUpdate(
        { missionId: input.missionId },
        {
          $set: {
            organizationId: project.organizationId,
            projectId: project.id,
            key: input.key,
            status: 'INGESTED',
            createdBy: principal.sub,
          },
          $setOnInsert: {
            missionId: input.missionId,
          },
        },
        { new: true, upsert: true, session },
      );
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: project.organizationId,
          action: 'image.media_batch.ingest',
          resourceType: 'MEDIA_BATCH',
          resourceId: mediaBatch.id,
          permissionKey: 'image.media_batch.ingest',
          after: { status: 'INGESTED' },
        },
        session,
      );
      await this.outboxService.append(
        {
          eventId: `media-ingested:${mediaBatch.id}`,
          eventType: 'MediaIngested.v1',
          eventVersion: 1,
          aggregateType: 'MEDIA_BATCH',
          aggregateId: mediaBatch.id,
          payload: {
            eventType: 'MediaIngested',
            eventVersion: 1,
            mediaBatchId: mediaBatch.id,
            missionId: mediaBatch.missionId,
            organizationId: mediaBatch.organizationId,
          },
        },
        session,
      );
      return mediaBatch;
    });
  }

  async createSample(
    principal: AuthenticatedPrincipal,
    input: { mediaBatchId: string },
  ) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const mediaBatch = await this.mediaBatchModel
        .findById(input.mediaBatchId)
        .session(session);
      if (!mediaBatch) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Media batch was not found',
        );
      }
      if (mediaBatch.organizationId !== principal.activeOrganizationId) {
        throw new AppException(
          403,
          REASON_CODES.PERMISSION_DENIED,
          'Media batch is outside the active organization',
        );
      }

      const [sample] = await this.sampleModel.create(
        [
          {
            organizationId: mediaBatch.organizationId,
            projectId: mediaBatch.projectId,
            mediaBatchId: mediaBatch.id,
            missionId: mediaBatch.missionId,
            status: 'PENDING',
            createdBy: principal.sub,
          },
        ],
        { session },
      );
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: sample.organizationId,
          action: 'image.sample.create',
          resourceType: 'SAMPLE',
          resourceId: sample.id,
          after: { status: sample.status },
        },
        session,
      );
      return sample;
    });
  }

  async approveSample(principal: AuthenticatedPrincipal, sampleId: string) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const sample = await this.sampleModel.findById(sampleId).session(session);
      if (!sample) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Sample was not found',
        );
      }
      if (sample.organizationId !== principal.activeOrganizationId) {
        throw new AppException(
          403,
          REASON_CODES.PERMISSION_DENIED,
          'Sample is outside the active organization',
        );
      }
      if (sample.createdBy === principal.sub) {
        throw new AppException(
          403,
          REASON_CODES.PERMISSION_DENIED,
          'Sample creator cannot self-approve',
        );
      }
      if (sample.status !== 'PENDING') {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Sample cannot be approved from the current state',
        );
      }

      sample.status = 'APPROVED';
      sample.approvedBy = principal.sub;
      await sample.save({ session });
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: sample.organizationId,
          action: 'image.sample.approve',
          resourceType: 'SAMPLE',
          resourceId: sample.id,
          permissionKey: 'image.sample.approve',
          after: { status: sample.status },
        },
        session,
      );
      await this.outboxService.append(
        {
          eventId: `sample-approved:${sample.id}`,
          eventType: 'SampleApproved.v1',
          eventVersion: 1,
          aggregateType: 'SAMPLE',
          aggregateId: sample.id,
          payload: {
            eventType: 'SampleApproved',
            eventVersion: 1,
            sampleId: sample.id,
            mediaBatchId: sample.mediaBatchId,
            organizationId: sample.organizationId,
          },
        },
        session,
      );
      return sample;
    });
  }

  async listMediaBatches(principal: AuthenticatedPrincipal) {
    return listReadableMediaBatches(
      this.mediaBatchModel,
      this.projectsService,
      principal,
    );
  }
}
