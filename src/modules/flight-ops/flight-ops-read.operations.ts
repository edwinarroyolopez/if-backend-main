import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CreateMissionDto, ListMissionsQueryDto } from './flight-ops.dto';
import { MissionMediaAssetDocument } from './mission-media-asset.schema';
import { MissionDocument } from './mission.schema';
import {
  FlightOpsBaseOperations,
  cleanOptional,
  normalizeScheduledWindow,
  toMediaDto,
  toMissionState,
  toScheduledWindowDto,
} from './flight-ops-base.operations';

export abstract class FlightOpsReadOperations extends FlightOpsBaseOperations {
  async createMission(
    principal: AuthenticatedPrincipal,
    dto: CreateMissionDto,
  ) {
    const project = await this.projectsService.findById(dto.projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    if (project.organizationId !== dto.organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project does not belong to the requested organization',
      );
    }
    const assignedPilotId = cleanOptional(dto.assignedPilotId);
    if (assignedPilotId) {
      await this.pilotAssignmentPolicy.assertAssignable({
        assignedPilotId,
        organizationId: project.organizationId,
        project: { id: project.id, accessRoleIds: project.accessRoleIds },
      });
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
            customerServiceObservations: cleanOptional(
              dto.customerServiceObservations,
            ),
            assignedPilotId: assignedPilotId ?? null,
            assignmentStatus: assignedPilotId ? 'ASSIGNED' : 'UNASSIGNED',
            assignedAt: assignedPilotId ? now : undefined,
            assignedBy: assignedPilotId ? principal.sub : undefined,
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

  async listMissions(
    principal: AuthenticatedPrincipal,
    filters: ListMissionsQueryDto,
  ) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }

    const accessibleProjectIds =
      await this.projectsService.listAccessibleProjectIds(
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
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.reviewStatus) query.reviewStatus = filters.reviewStatus;
    if (filters.assignedToMe === 'true') query.assignedPilotId = principal.sub;

    const missions = await this.missionModel
      .find(query)
      .sort({ createdAt: -1, _id: 1 });
    return Promise.all(
      missions.map((mission) => this.toMissionSummary(mission)),
    );
  }

  protected async toMissionSummary(mission: MissionDocument) {
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

  protected toMissionResponse(
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
}
