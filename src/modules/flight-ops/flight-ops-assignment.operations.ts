import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { FlightOpsReadOperations } from './flight-ops-read.operations';
import { toMissionState } from './flight-ops-base.operations';

export abstract class FlightOpsAssignmentOperations extends FlightOpsReadOperations {
  async assignMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    assignedPilotId: string,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.assign:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        const project = await this.projectsService.findById(mission.projectId);
        if (!project) {
          throw new AppException(
            404,
            REASON_CODES.RESOURCE_NOT_FOUND,
            'Project was not found',
          );
        }
        await this.pilotAssignmentPolicy.assertAssignable({
          assignedPilotId,
          organizationId: mission.organizationId,
          project: { id: project.id, accessRoleIds: project.accessRoleIds },
          mission,
        });
        if (
          ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(
            mission.status,
          )
        ) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_NOT_ASSIGNABLE,
            'Mission cannot be assigned from the current state',
          );
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
        const eventType = previousPilotId
          ? 'MissionReassigned.v1'
          : 'MissionAssigned.v1';
        const eventId = `${eventType}:${mission.id}:${idempotencyKey}`;
        await this.recordAudit({
          principal,
          mission,
          action: previousPilotId
            ? 'flight.request.reassign'
            : 'flight.request.assign',
          permissionKey: 'flight.request.assign',
          before,
          after: toMissionState(mission),
          metadata: {
            previousPilotId,
            assignedPilotId,
            previousAssignmentStatus,
          },
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
        await this.idempotencyService.complete(
          recordId,
          200,
          response,
          session,
        );
        return response;
      },
    );
  }

  async acceptMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.accept:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        this.assertAssignedPilot(principal, mission);
        if (
          mission.status === 'READY' &&
          mission.assignmentStatus === 'ACCEPTED'
        ) {
          const response = this.commandResponse(mission);
          await this.idempotencyService.complete(
            recordId,
            200,
            response,
            session,
          );
          return response;
        }
        if (
          mission.status !== 'PLANNED' ||
          mission.assignmentStatus !== 'ASSIGNED'
        ) {
          throw new AppException(
            409,
            REASON_CODES.RESOURCE_STATE_CONFLICT,
            'Mission cannot be accepted from the current state',
          );
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
        await this.appendMissionEvent({
          eventType: 'MissionAccepted.v1',
          eventId,
          mission,
          actorId: principal.sub,
          occurredAt: now,
          session,
        });
        const response = this.commandResponse(mission, eventId);
        await this.idempotencyService.complete(
          recordId,
          200,
          response,
          session,
        );
        return response;
      },
    );
  }

  async rejectMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    observations: string,
    idempotencyKey: string,
  ) {
    const trimmed = observations.trim();
    if (!trimmed) {
      throw new AppException(
        400,
        REASON_CODES.MISSION_REJECTION_OBSERVATION_REQUIRED,
        'Rejection observations are required',
      );
    }
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.reject:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        this.assertAssignedPilot(principal, mission);
        if (
          mission.status === 'READY' &&
          mission.assignmentStatus === 'ACCEPTED'
        ) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_REJECT_AFTER_ACCEPT_NOT_ALLOWED,
            'Accepted missions cannot be rejected',
          );
        }
        if (
          mission.status !== 'PLANNED' ||
          mission.assignmentStatus !== 'ASSIGNED'
        ) {
          throw new AppException(
            409,
            REASON_CODES.RESOURCE_STATE_CONFLICT,
            'Mission cannot be rejected from the current state',
          );
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
        await this.appendMissionEvent({
          eventType: 'MissionRejected.v1',
          eventId,
          mission,
          actorId: principal.sub,
          occurredAt: now,
          session,
        });
        const response = this.commandResponse(mission, eventId);
        await this.idempotencyService.complete(
          recordId,
          200,
          response,
          session,
        );
        return response;
      },
    );
  }
}
