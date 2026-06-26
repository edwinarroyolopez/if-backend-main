import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
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
import { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { MissionMediaAssetDocument } from './mission-media-asset.schema';
import { MissionMediaStoragePort } from './mission-media-storage.port';
import { MissionDocument } from './mission.schema';
import { PilotAssignmentPolicy } from './pilot-assignment-policy.service';

export type MissionEventInput = {
  eventType: string;
  eventId: string;
  mission: MissionDocument;
  actorId: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
  session: ClientSession;
};

export abstract class FlightOpsBaseOperations implements ResourceScopeResolver {
  constructor(
    protected readonly missionModel: HydratedModel<MissionDocument>,
    protected readonly mediaAssetModel: HydratedModel<MissionMediaAssetDocument>,
    protected readonly projectsService: ProjectsService,
    protected readonly resourceScopeService: ResourceScopeService,
    protected readonly transactionManagerService: TransactionManagerService,
    protected readonly idempotencyService: IdempotencyService,
    protected readonly auditService: AuditService,
    protected readonly outboxService: OutboxService,
    protected readonly identityService: IdentityService,
    protected readonly mediaStorage: MissionMediaStoragePort,
    protected readonly pilotAssignmentPolicy: PilotAssignmentPolicy,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'MISSION';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const mission = await this.missionModel.findById(reference.resourceId);
    if (!mission) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Mission was not found',
      );
    }
    const project = await this.projectsService.findById(mission.projectId);

    return {
      resourceType: 'MISSION',
      resourceId: mission.id,
      organizationId: mission.organizationId,
      moduleKey: 'flight',
      projectId: mission.projectId,
      projectAccessRoleIds: project?.accessRoleIds ?? [],
      candidateScopes: [
        { type: 'MISSION', id: mission.id },
        { type: 'PROJECT', id: mission.projectId },
        { type: 'MODULE', id: 'flight' },
        { type: 'ORGANIZATION', id: mission.organizationId },
      ],
    };
  }

  protected async runIdempotent<T extends Record<string, unknown>>(
    principal: AuthenticatedPrincipal,
    key: string,
    operation: string,
    handler: (recordId: string, session: ClientSession) => Promise<T>,
  ) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const begun = await this.idempotencyService.begin(
        principal.activeOrganizationId!,
        key,
        operation,
        session,
      );
      if (begun.type === 'completed') {
        return begun.record.responseBody as T;
      }
      return handler(begun.record.id, session);
    });
  }

  protected async findMissionOrThrow(
    missionId: string,
    session?: ClientSession,
  ) {
    const query = this.missionModel.findById(missionId);
    if (session) {
      query.session(session);
    }
    const mission = await query;
    if (!mission) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Mission was not found',
      );
    }
    return mission;
  }

  protected assertMissionReadableByPrincipal(
    principal: AuthenticatedPrincipal,
    mission: MissionDocument,
  ) {
    if (mission.organizationId !== principal.activeOrganizationId) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Mission was not found',
      );
    }
    if (mission.assignedPilotId && mission.assignedPilotId === principal.sub) {
      return;
    }
  }

  protected assertAssignedPilot(
    principal: AuthenticatedPrincipal,
    mission: MissionDocument,
  ) {
    if (mission.assignedPilotId !== principal.sub) {
      throw new AppException(
        403,
        REASON_CODES.MISSION_ASSIGNED_PILOT_REQUIRED,
        'Only the assigned pilot can perform this action',
      );
    }
  }

  protected assertMediaUploadAllowed(mission: MissionDocument) {
    if (
      mission.status !== 'IN_PROGRESS' ||
      mission.assignmentStatus !== 'ACCEPTED'
    ) {
      throw new AppException(
        409,
        REASON_CODES.MISSION_PILOT_ACCEPTANCE_REQUIRED,
        'Mission must be in progress and accepted before upload',
      );
    }
    if (mission.pilotCompletedAt) {
      throw new AppException(
        409,
        REASON_CODES.MISSION_MEDIA_LOCKED,
        'Mission media is locked after completion',
      );
    }
  }

  protected commandResponse(mission: MissionDocument, eventId?: string) {
    return {
      missionId: mission.id,
      status: mission.status,
      assignmentStatus: mission.assignmentStatus,
      reviewStatus: mission.reviewStatus,
      eventId,
    };
  }

  protected async recordAudit(input: {
    principal: AuthenticatedPrincipal;
    mission: MissionDocument;
    action: string;
    permissionKey: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    session: ClientSession;
  }) {
    await this.auditService.record(
      {
        actorType: input.principal.principalType,
        actorId: input.principal.sub,
        actorSessionId: input.principal.sessionId,
        organizationId: input.mission.organizationId,
        action: input.action,
        resourceType: 'MISSION',
        resourceId: input.mission.id,
        permissionKey: input.permissionKey,
        before: input.before,
        after: input.after,
        metadata: input.metadata,
      },
      input.session,
    );
  }

  protected async appendMissionEvent(input: MissionEventInput) {
    await this.outboxService.append(
      {
        eventId: input.eventId,
        eventType: input.eventType,
        eventVersion: 1,
        aggregateType: 'MISSION',
        aggregateId: input.mission.id,
        correlationId: input.eventId,
        payload: {
          eventId: input.eventId,
          eventType: input.eventType,
          eventVersion: 1,
          occurredAt: input.occurredAt.toISOString(),
          organizationId: input.mission.organizationId,
          projectId: input.mission.projectId,
          missionId: input.mission.id,
          actorId: input.actorId,
          createdBy: input.mission.createdBy,
          assignedBy: input.mission.assignedBy,
          assignedPilotId: input.mission.assignedPilotId,
          correlationId: input.eventId,
          ...input.payload,
        },
      },
      input.session,
    );
  }
}

export function normalizeScheduledWindow(input: {
  startsAt: string;
  endsAt?: string;
}) {
  return {
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
  };
}

export function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function toMissionState(mission: MissionDocument) {
  return {
    status: mission.status,
    reviewStatus: mission.reviewStatus,
    assignmentStatus: mission.assignmentStatus,
    assignedPilotId: mission.assignedPilotId,
  };
}

export function toScheduledWindowDto(mission: MissionDocument) {
  return mission.scheduledWindow
    ? {
        startsAt: mission.scheduledWindow.startsAt?.toISOString(),
        endsAt: mission.scheduledWindow.endsAt?.toISOString(),
      }
    : undefined;
}

export function toMediaDto(asset: MissionMediaAssetDocument) {
  return {
    id: asset.id,
    missionId: asset.missionId,
    cloudinaryPublicId: asset.cloudinaryPublicId,
    secureUrl: asset.secureUrl,
    resourceType: asset.resourceType,
    originalFilename: asset.originalFilename,
    uploadedBy: asset.uploadedBy,
    uploadedAt: asset.uploadedAt.toISOString(),
    lockedAt: asset.lockedAt?.toISOString(),
  };
}
