import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { OutboxRelayService } from 'src/platform/events/outbox-relay.service';
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
    private readonly resourceScopeService: ResourceScopeService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly outboxRelayService: OutboxRelayService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'MEDIA_BATCH';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
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
    return this.transactionManagerService.runInTransaction(async (session) => {
      const mediaBatch = await this.mediaBatchModel.findOneAndUpdate(
        { missionId: input.missionId },
        {
          $set: {
            organizationId: input.organizationId,
            projectId: input.projectId,
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
          organizationId: input.organizationId,
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
    const mediaBatch = await this.mediaBatchModel.findById(input.mediaBatchId);
    if (!mediaBatch) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Media batch was not found',
      );
    }

    const [sample] = await this.sampleModel.create([
      {
        organizationId: mediaBatch.organizationId,
        projectId: mediaBatch.projectId,
        mediaBatchId: mediaBatch.id,
        missionId: mediaBatch.missionId,
        status: 'PENDING',
        createdBy: principal.sub,
      },
    ]);
    return sample;
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
      if (sample.createdBy === principal.sub) {
        throw new AppException(
          403,
          REASON_CODES.PERMISSION_DENIED,
          'Sample creator cannot self-approve',
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
