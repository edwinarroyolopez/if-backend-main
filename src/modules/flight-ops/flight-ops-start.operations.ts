import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { FlightOpsAssignmentOperations } from './flight-ops-assignment.operations';
import { toMissionState } from './flight-ops-base.operations';

export abstract class FlightOpsStartOperations extends FlightOpsAssignmentOperations {
  async startMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.start:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        this.assertAssignedPilot(principal, mission);
        if (
          mission.status !== 'READY' ||
          mission.assignmentStatus !== 'ACCEPTED'
        ) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_PILOT_ACCEPTANCE_REQUIRED,
            'Mission must be accepted before start',
          );
        }
        const before = toMissionState(mission);
        const now = new Date();
        mission.status = 'IN_PROGRESS';
        mission.startedAt = now;
        mission.startedBy = principal.sub;
        await mission.save({ session });
        const eventId = `MissionStarted.v1:${mission.id}:${idempotencyKey}`;
        await this.recordAudit({
          principal,
          mission,
          action: 'flight.request.start',
          permissionKey: 'flight.request.start',
          before,
          after: toMissionState(mission),
          session,
        });
        await this.appendMissionEvent({
          eventType: 'MissionStarted.v1',
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
