import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
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
import { CloudinaryUploadService, UploadableFile } from './cloudinary-upload.service';
import { CreateMissionDto, ListMissionsQueryDto } from './flight-ops.dto';
import {
  MissionMediaAsset,
  MissionMediaAssetDocument,
} from './mission-media-asset.schema';
import { AssignmentStatus, Mission, MissionDocument } from './mission.schema';

type MissionEventInput = {
  eventType: string;
  eventId: string;
  mission: MissionDocument;
  actorId: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
  session: ClientSession;
};

@Injectable()
export class FlightOpsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Mission.name)
    private readonly missionModel: Model<MissionDocument>,
    @InjectModel(MissionMediaAsset.name)
    private readonly mediaAssetModel: Model<MissionMediaAssetDocument>,
    private readonly projectsService: ProjectsService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly identityService: IdentityService,
    private readonly cloudinaryUploadService: CloudinaryUploadService,
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
      throw new AppException(404, REASON_CODES.RESOURCE_NOT_FOUND, 'Mission was not found');
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

  async createMission(principal: AuthenticatedPrincipal, dto: CreateMissionDto) {
    const project = await this.projectsService.findById(dto.projectId);
    if (!project) {
      throw new AppException(404, REASON_CODES.RESOURCE_NOT_FOUND, 'Project was not found');
    }
    if (project.organizationId !== dto.organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project does not belong to the requested organization',
      );
    }

    return this.transactionManagerService.runInTransaction(async (session) => {
      const now = new Date();
      const [mission] = await this.missionModel.create(
        [
          {
            organizationId: project.organizationId,
            projectId: project.id,
            key: dto.key.trim(),
            name: dto.name.trim(),
            status: 'PLANNED',
            reviewStatus: 'NOT_READY',
            buildingName: dto.buildingName.trim(),
            address: dto.address.trim(),
            coordinates: dto.coordinates,
            scheduledWindow: normalizeScheduledWindow(dto.scheduledWindow),
            priority: dto.priority ?? 'NORMAL',
            customerServiceObservations: cleanOptional(dto.customerServiceObservations),
            assignedPilotId: cleanOptional(dto.assignedPilotId) ?? null,
            assignmentStatus: dto.assignedPilotId ? 'ASSIGNED' : 'UNASSIGNED',
            assignedAt: dto.assignedPilotId ? now : undefined,
            assignedBy: dto.assignedPilotId ? principal.sub : undefined,
            createdBy: principal.sub,
          },
        ],
        { session },
      );
      const eventId = `MissionRequested.v1:${mission.id}`;
      await this.recordAudit({
        principal,
        mission,
        action: 'flight.request.create',
        permissionKey: 'flight.request.create',
        after: toMissionState(mission),
        session,
      });
      await this.appendMissionEvent({
        eventType: 'MissionRequested.v1',
        eventId,
        mission,
        actorId: principal.sub,
        occurredAt: now,
        session,
      });
      return this.toMissionResponse(mission, [], eventId);
    });
  }

  async getMission(missionId: string): Promise<MissionDocument>;
  async getMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
  ): Promise<Record<string, unknown>>;
  async getMission(
    principalOrMissionId: AuthenticatedPrincipal | string,
    maybeMissionId?: string,
  ): Promise<MissionDocument | Record<string, unknown>> {
    if (typeof principalOrMissionId === 'string') {
      return this.findMissionOrThrow(principalOrMissionId);
    }
    const principal = principalOrMissionId;
    const missionId = maybeMissionId!;
    const mission = await this.findMissionOrThrow(missionId);
    this.assertMissionReadableByPrincipal(principal, mission);
    const media = await this.mediaAssetModel
      .find({ organizationId: mission.organizationId, missionId: mission.id })
      .sort({ uploadedAt: -1, _id: -1 });
    return this.toMissionResponse(mission, media);
  }

  async listMissions(principal: AuthenticatedPrincipal, filters: ListMissionsQueryDto) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }

    const accessibleProjectIds = await this.projectsService.listAccessibleProjectIds(
      principal,
      'flight',
      'flight.request.read',
    );
    if (accessibleProjectIds.length === 0) {
      return [];
    }

    const query: Record<string, unknown> = {
      organizationId,
      projectId: { $in: accessibleProjectIds },
    };
    if (filters.projectId) {
      if (!accessibleProjectIds.includes(filters.projectId)) {
        return [];
      }
      query.projectId = filters.projectId;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.priority) {
      query.priority = filters.priority;
    }
    if (filters.reviewStatus) {
      query.reviewStatus = filters.reviewStatus;
    }
    if (filters.assignedToMe === 'true') {
      query.assignedPilotId = principal.sub;
    }

    const missions = await this.missionModel.find(query).sort({ createdAt: -1, _id: 1 });
    return Promise.all(missions.map((mission) => this.toMissionSummary(mission)));
  }

  async assignMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    assignedPilotId: string,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(principal, idempotencyKey, `mission.assign:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(mission.status)) {
        throw new AppException(409, REASON_CODES.MISSION_NOT_ASSIGNABLE, 'Mission cannot be assigned from the current state');
      }
      const previousPilotId = mission.assignedPilotId ?? undefined;
      const previousAssignmentStatus = mission.assignmentStatus;
      const now = new Date();
      const before = toMissionState(mission);
      mission.assignedPilotId = assignedPilotId;
      mission.assignmentStatus = 'ASSIGNED';
      mission.assignedAt = now;
      mission.assignedBy = principal.sub;
      mission.pilotAcceptedAt = undefined;
      mission.pilotRejectedAt = undefined;
      mission.pilotRejectionObservations = undefined;
      await mission.save({ session });
      const eventType = previousPilotId ? 'MissionReassigned.v1' : 'MissionAssigned.v1';
      const eventId = `${eventType}:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({
        principal,
        mission,
        action: previousPilotId ? 'flight.request.reassign' : 'flight.request.assign',
        permissionKey: 'flight.request.assign',
        before,
        after: toMissionState(mission),
        metadata: { previousPilotId, assignedPilotId, previousAssignmentStatus },
        session,
      });
      await this.appendMissionEvent({
        eventType,
        eventId,
        mission,
        actorId: principal.sub,
        occurredAt: now,
        payload: { previousPilotId, previousAssignmentStatus },
        session,
      });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async acceptMission(principal: AuthenticatedPrincipal, missionId: string, idempotencyKey: string) {
    return this.runIdempotent(principal, idempotencyKey, `mission.accept:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      this.assertAssignedPilot(principal, mission);
      if (mission.status === 'READY' && mission.assignmentStatus === 'ACCEPTED') {
        const response = this.commandResponse(mission);
        await this.idempotencyService.complete(recordId, 200, response, session);
        return response;
      }
      if (mission.status !== 'PLANNED' || mission.assignmentStatus !== 'ASSIGNED') {
        throw new AppException(409, REASON_CODES.RESOURCE_STATE_CONFLICT, 'Mission cannot be accepted from the current state');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.status = 'READY';
      mission.assignmentStatus = 'ACCEPTED';
      mission.pilotAcceptedAt = now;
      await mission.save({ session });
      const eventId = `MissionAccepted.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({
        principal,
        mission,
        action: 'flight.request.accept',
        permissionKey: 'flight.request.start',
        before,
        after: toMissionState(mission),
        session,
      });
      await this.appendMissionEvent({ eventType: 'MissionAccepted.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async rejectMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    observations: string,
    idempotencyKey: string,
  ) {
    const trimmed = observations.trim();
    if (!trimmed) {
      throw new AppException(400, REASON_CODES.MISSION_REJECTION_OBSERVATION_REQUIRED, 'Rejection observations are required');
    }
    return this.runIdempotent(principal, idempotencyKey, `mission.reject:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      this.assertAssignedPilot(principal, mission);
      if (mission.status === 'READY' && mission.assignmentStatus === 'ACCEPTED') {
        throw new AppException(409, REASON_CODES.MISSION_REJECT_AFTER_ACCEPT_NOT_ALLOWED, 'Accepted missions cannot be rejected');
      }
      if (mission.status !== 'PLANNED' || mission.assignmentStatus !== 'ASSIGNED') {
        throw new AppException(409, REASON_CODES.RESOURCE_STATE_CONFLICT, 'Mission cannot be rejected from the current state');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.assignmentStatus = 'REJECTED';
      mission.pilotRejectedAt = now;
      mission.pilotRejectionObservations = trimmed;
      await mission.save({ session });
      const eventId = `MissionRejected.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({
        principal,
        mission,
        action: 'flight.request.reject',
        permissionKey: 'flight.request.start',
        before,
        after: toMissionState(mission),
        metadata: { hasObservations: true },
        session,
      });
      await this.appendMissionEvent({ eventType: 'MissionRejected.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async startMission(principal: AuthenticatedPrincipal, missionId: string, idempotencyKey: string) {
    return this.runIdempotent(principal, idempotencyKey, `mission.start:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      this.assertAssignedPilot(principal, mission);
      if (mission.status !== 'READY' || mission.assignmentStatus !== 'ACCEPTED') {
        throw new AppException(409, REASON_CODES.MISSION_PILOT_ACCEPTANCE_REQUIRED, 'Mission must be accepted before start');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.status = 'IN_PROGRESS';
      mission.startedAt = now;
      mission.startedBy = principal.sub;
      await mission.save({ session });
      const eventId = `MissionStarted.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({ principal, mission, action: 'flight.request.start', permissionKey: 'flight.request.start', before, after: toMissionState(mission), session });
      await this.appendMissionEvent({ eventType: 'MissionStarted.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async uploadMissionMedia(
    principal: AuthenticatedPrincipal,
    missionId: string,
    file: UploadableFile | undefined,
    idempotencyKey: string,
  ) {
    if (!file) {
      throw new AppException(400, REASON_CODES.VALIDATION_FAILED, 'File is required');
    }
    const mission = await this.findMissionOrThrow(missionId);
    this.assertAssignedPilot(principal, mission);
    this.assertMediaUploadAllowed(mission);
    const uploaded = await this.cloudinaryUploadService.uploadMissionMedia({
      file,
      organizationId: mission.organizationId,
      missionId: mission.id,
    });

    return this.runIdempotent(principal, idempotencyKey, `mission.media.upload:${missionId}`, async (recordId, session) => {
      const current = await this.findMissionOrThrow(missionId, session);
      this.assertAssignedPilot(principal, current);
      this.assertMediaUploadAllowed(current);
      const now = new Date();
      const [asset] = await this.mediaAssetModel.create(
        [
          {
            organizationId: current.organizationId,
            missionId: current.id,
            cloudinaryPublicId: uploaded.cloudinaryPublicId,
            secureUrl: uploaded.secureUrl,
            resourceType: uploaded.resourceType,
            originalFilename: uploaded.originalFilename,
            uploadedBy: principal.sub,
            uploadedAt: now,
          },
        ],
        { session },
      );
      const eventId = `MissionMediaUploaded.v1:${current.id}:${idempotencyKey}`;
      await this.recordAudit({
        principal,
        mission: current,
        action: 'flight.media.upload',
        permissionKey: 'flight.media.upload',
        after: { mediaAssetId: asset.id, resourceType: asset.resourceType },
        metadata: { mediaAssetId: asset.id, cloudinaryPublicId: asset.cloudinaryPublicId },
        session,
      });
      await this.appendMissionEvent({
        eventType: 'MissionMediaUploaded.v1',
        eventId,
        mission: current,
        actorId: principal.sub,
        occurredAt: now,
        payload: { mediaAssetId: asset.id, resourceType: asset.resourceType },
        session,
      });
      const response = { ...toMediaDto(asset), eventId };
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async completeMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    pilotObservations: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(principal, idempotencyKey, `mission.pilot-complete:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      this.assertAssignedPilot(principal, mission);
      if (mission.status === 'COMPLETED') {
        const response = this.commandResponse(mission);
        await this.idempotencyService.complete(recordId, 200, response, session);
        return response;
      }
      if (mission.status !== 'IN_PROGRESS') {
        throw new AppException(409, REASON_CODES.MISSION_NOT_COMPLETABLE, 'Mission cannot be completed from the current state');
      }
      const mediaCount = await this.mediaAssetModel.countDocuments({ missionId: mission.id }).session(session);
      if (mediaCount === 0) {
        throw new AppException(409, REASON_CODES.MISSION_MEDIA_REQUIRED, 'Mission media is required before completion');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.status = 'COMPLETED';
      mission.reviewStatus = 'PENDING_REVIEW';
      mission.completedAt = now;
      mission.completedBy = principal.sub;
      mission.pilotCompletedAt = now;
      mission.pilotObservations = cleanOptional(pilotObservations);
      await mission.save({ session });
      await this.mediaAssetModel.updateMany({ missionId: mission.id }, { $set: { lockedAt: now } }, { session });
      const eventId = `MissionPilotCompleted.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({ principal, mission, action: 'flight.request.complete', permissionKey: 'flight.request.complete', before, after: toMissionState(mission), metadata: { mediaCount }, session });
      await this.appendMissionEvent({ eventType: 'MissionPilotCompleted.v1', eventId, mission, actorId: principal.sub, occurredAt: now, payload: { mediaCount }, session });
      const response = { ...this.commandResponse(mission, eventId), mediaCount };
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async reviewCloseMission(principal: AuthenticatedPrincipal, missionId: string, reviewObservations: string | undefined, idempotencyKey: string) {
    return this.runIdempotent(principal, idempotencyKey, `mission.review-close:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      if (mission.assignedPilotId === principal.sub) {
        throw new AppException(409, REASON_CODES.MISSION_REVIEW_REQUIRES_SEPARATE_ACTOR, 'Review close requires a separate actor');
      }
      if (mission.status !== 'COMPLETED' || mission.reviewStatus !== 'PENDING_REVIEW') {
        throw new AppException(409, REASON_CODES.MISSION_REVIEW_NOT_READY, 'Mission is not ready for review close');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.reviewStatus = 'REVIEWED_CLOSED';
      mission.reviewedClosedAt = now;
      mission.reviewedClosedBy = principal.sub;
      mission.reviewObservations = cleanOptional(reviewObservations);
      await mission.save({ session });
      const eventId = `MissionReviewedClosed.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({ principal, mission, action: 'flight.request.review_close', permissionKey: 'flight.observation.write', before, after: toMissionState(mission), metadata: { reviewStatus: mission.reviewStatus, separateActorEnforced: true }, session });
      await this.appendMissionEvent({ eventType: 'MissionReviewedClosed.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async cancelMission(principal: AuthenticatedPrincipal, missionId: string, observations: string | undefined, idempotencyKey: string) {
    return this.runIdempotent(principal, idempotencyKey, `mission.cancel:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      if (mission.status === 'IN_PROGRESS') {
        throw new AppException(409, REASON_CODES.MISSION_ALREADY_IN_PROGRESS, 'Mission cannot be cancelled after start');
      }
      if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(mission.status)) {
        throw new AppException(409, REASON_CODES.RESOURCE_STATE_CONFLICT, 'Mission cannot be cancelled from the current state');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.status = 'CANCELLED';
      mission.reviewStatus = 'NOT_READY';
      mission.cancelledAt = now;
      mission.cancelledBy = principal.sub;
      mission.cancellationObservations = cleanOptional(observations);
      await mission.save({ session });
      const eventId = `MissionCancelled.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({ principal, mission, action: 'flight.request.cancel', permissionKey: 'flight.request.cancel', before, after: toMissionState(mission), session });
      await this.appendMissionEvent({ eventType: 'MissionCancelled.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  async failMission(principal: AuthenticatedPrincipal, missionId: string, observations: string, idempotencyKey: string) {
    const trimmed = observations.trim();
    if (!trimmed) {
      throw new AppException(400, REASON_CODES.MISSION_FAILURE_OBSERVATION_REQUIRED, 'Failure observations are required');
    }
    return this.runIdempotent(principal, idempotencyKey, `mission.fail:${missionId}`, async (recordId, session) => {
      const mission = await this.findMissionOrThrow(missionId, session);
      if (!['READY', 'IN_PROGRESS'].includes(mission.status)) {
        throw new AppException(409, REASON_CODES.RESOURCE_STATE_CONFLICT, 'Mission cannot fail from the current state');
      }
      const before = toMissionState(mission);
      const now = new Date();
      mission.status = 'FAILED';
      mission.reviewStatus = 'NOT_READY';
      mission.failureObservations = trimmed;
      await mission.save({ session });
      const eventId = `MissionFailed.v1:${mission.id}:${idempotencyKey}`;
      await this.recordAudit({ principal, mission, action: 'flight.request.fail', permissionKey: 'flight.request.complete', before, after: toMissionState(mission), metadata: { hasObservations: true }, session });
      await this.appendMissionEvent({ eventType: 'MissionFailed.v1', eventId, mission, actorId: principal.sub, occurredAt: now, session });
      const response = this.commandResponse(mission, eventId);
      await this.idempotencyService.complete(recordId, 200, response, session);
      return response;
    });
  }

  private async runIdempotent<T extends Record<string, unknown>>(
    principal: AuthenticatedPrincipal,
    key: string,
    operation: string,
    handler: (recordId: string, session: ClientSession) => Promise<T>,
  ) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const begun = await this.idempotencyService.begin(principal.activeOrganizationId!, key, operation, session);
      if (begun.type === 'completed') {
        return begun.record.responseBody as T;
      }
      return handler(begun.record.id, session);
    });
  }

  private async findMissionOrThrow(missionId: string, session?: ClientSession) {
    const query = this.missionModel.findById(missionId);
    if (session) {
      query.session(session);
    }
    const mission = await query;
    if (!mission) {
      throw new AppException(404, REASON_CODES.RESOURCE_NOT_FOUND, 'Mission was not found');
    }
    return mission;
  }

  private assertMissionReadableByPrincipal(principal: AuthenticatedPrincipal, mission: MissionDocument) {
    if (mission.organizationId !== principal.activeOrganizationId) {
      throw new AppException(404, REASON_CODES.RESOURCE_NOT_FOUND, 'Mission was not found');
    }
    if (mission.assignedPilotId && mission.assignedPilotId === principal.sub) {
      return;
    }
  }

  private assertAssignedPilot(principal: AuthenticatedPrincipal, mission: MissionDocument) {
    if (mission.assignedPilotId !== principal.sub) {
      throw new AppException(403, REASON_CODES.MISSION_ASSIGNED_PILOT_REQUIRED, 'Only the assigned pilot can perform this action');
    }
  }

  private assertMediaUploadAllowed(mission: MissionDocument) {
    if (mission.status !== 'IN_PROGRESS' || mission.assignmentStatus !== 'ACCEPTED') {
      throw new AppException(409, REASON_CODES.MISSION_PILOT_ACCEPTANCE_REQUIRED, 'Mission must be in progress and accepted before upload');
    }
    if (mission.pilotCompletedAt) {
      throw new AppException(409, REASON_CODES.MISSION_MEDIA_LOCKED, 'Mission media is locked after completion');
    }
  }

  private commandResponse(mission: MissionDocument, eventId?: string) {
    return {
      missionId: mission.id,
      status: mission.status,
      assignmentStatus: mission.assignmentStatus,
      reviewStatus: mission.reviewStatus,
      eventId,
    };
  }

  private async toMissionSummary(mission: MissionDocument) {
    const pilot = mission.assignedPilotId
      ? await this.identityService.findUserById(mission.assignedPilotId)
      : null;
    return {
      id: mission.id,
      organizationId: mission.organizationId,
      projectId: mission.projectId,
      key: mission.key,
      name: mission.name,
      status: mission.status,
      reviewStatus: mission.reviewStatus,
      assignmentStatus: mission.assignmentStatus,
      priority: mission.priority,
      scheduledWindow: toScheduledWindowDto(mission),
      assignedPilotId: mission.assignedPilotId ?? null,
      assignedPilot: pilot
        ? { id: pilot.id, displayName: pilot.displayName }
        : null,
    };
  }

  private toMissionResponse(
    mission: MissionDocument,
    media: MissionMediaAssetDocument[],
    eventId?: string,
  ) {
    return {
      id: mission.id,
      organizationId: mission.organizationId,
      projectId: mission.projectId,
      key: mission.key,
      name: mission.name,
      status: mission.status,
      reviewStatus: mission.reviewStatus,
      buildingName: mission.buildingName,
      address: mission.address,
      coordinates: mission.coordinates,
      scheduledWindow: toScheduledWindowDto(mission),
      priority: mission.priority,
      customerServiceObservations: mission.customerServiceObservations,
      assignedPilotId: mission.assignedPilotId ?? null,
      assignmentStatus: mission.assignmentStatus,
      assignedAt: mission.assignedAt?.toISOString(),
      assignedBy: mission.assignedBy,
      pilotAcceptedAt: mission.pilotAcceptedAt?.toISOString(),
      pilotRejectedAt: mission.pilotRejectedAt?.toISOString(),
      pilotRejectionObservations: mission.pilotRejectionObservations,
      startedAt: mission.startedAt?.toISOString(),
      pilotCompletedAt: mission.pilotCompletedAt?.toISOString(),
      pilotObservations: mission.pilotObservations,
      reviewedClosedAt: mission.reviewedClosedAt?.toISOString(),
      reviewedClosedBy: mission.reviewedClosedBy,
      reviewObservations: mission.reviewObservations,
      cancelledAt: mission.cancelledAt?.toISOString(),
      failureObservations: mission.failureObservations,
      media: media.map(toMediaDto),
      eventId,
    };
  }

  private async recordAudit(input: {
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

  private async appendMissionEvent(input: MissionEventInput) {
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

function normalizeScheduledWindow(input: { startsAt: string; endsAt?: string }) {
  return {
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
  };
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toScheduledWindowDto(mission: MissionDocument) {
  return mission.scheduledWindow
    ? {
        startsAt: mission.scheduledWindow.startsAt?.toISOString(),
        endsAt: mission.scheduledWindow.endsAt?.toISOString(),
      }
    : undefined;
}

function toMissionState(mission: MissionDocument) {
  return {
    status: mission.status,
    reviewStatus: mission.reviewStatus,
    assignmentStatus: mission.assignmentStatus,
    assignedPilotId: mission.assignedPilotId,
  };
}

function toMediaDto(asset: MissionMediaAssetDocument) {
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
