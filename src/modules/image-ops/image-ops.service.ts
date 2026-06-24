import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
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
import { MediaBatch, MediaBatchDocument } from './media-batch.schema';
import { Sample, SampleDocument } from './sample.schema';

@Injectable()
export class ImageOpsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(MediaBatch.name)
    private readonly mediaBatchModel: Model<MediaBatchDocument>,
    @InjectModel(Sample.name)
    private readonly sampleModel: Model<SampleDocument>,
    private readonly flightOpsService: FlightOpsService,
    private readonly projectsService: ProjectsService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'MEDIA_BATCH' || resourceType === 'SAMPLE';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    if (reference.resourceType === 'SAMPLE') {
      const sample = await this.sampleModel.findById(reference.resourceId);
      if (!sample) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Sample was not found',
        );
      }

      return {
        resourceType: 'SAMPLE',
        resourceId: sample.id,
        organizationId: sample.organizationId,
        moduleKey: 'image',
        candidateScopes: [
          { type: 'SAMPLE', id: sample.id },
          { type: 'MEDIA_BATCH', id: sample.mediaBatchId },
          { type: 'PROJECT', id: sample.projectId },
          { type: 'MODULE', id: 'image' },
          { type: 'ORGANIZATION', id: sample.organizationId },
        ],
      };
    }

    const mediaBatch = await this.mediaBatchModel.findById(
      reference.resourceId,
    );
    if (!mediaBatch) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Media batch was not found',
      );
    }
    return {
      resourceType: 'MEDIA_BATCH',
      resourceId: mediaBatch.id,
      organizationId: mediaBatch.organizationId,
      moduleKey: 'image',
      candidateScopes: [
        { type: 'MEDIA_BATCH', id: mediaBatch.id },
        { type: 'PROJECT', id: mediaBatch.projectId },
        { type: 'MODULE', id: 'image' },
        { type: 'ORGANIZATION', id: mediaBatch.organizationId },
      ],
    };
  }

  async handleMissionCompletedEvent(event: {
    organizationId: string;
    projectId: string;
    missionId: string;
    completedBy: string;
  }) {
    await this.mediaBatchModel.updateOne(
      { missionId: event.missionId },
      {
        $setOnInsert: {
          organizationId: event.organizationId,
          projectId: event.projectId,
          missionId: event.missionId,
          key: `batch-${event.missionId}`,
          status: 'PENDING_INGEST',
          createdBy: event.completedBy,
        },
      },
      { upsert: true },
    );
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

  async listMediaBatches(organizationId: string) {
    const batches = await this.mediaBatchModel
      .find({ organizationId })
      .sort({ createdAt: -1 });
    return batches.map((batch) => ({
      id: batch.id,
      missionId: batch.missionId,
      projectId: batch.projectId,
      key: batch.key,
      status: batch.status,
    }));
  }
}
