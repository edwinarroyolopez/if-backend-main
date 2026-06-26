import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { FlightOpsCompletionOperations } from './flight-ops-completion.operations';
import { cleanOptional, toMissionState } from './flight-ops-base.operations';

export class FlightOpsOperations extends FlightOpsCompletionOperations {
  async cancelMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    observations: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.cancel:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        if (mission.status === 'IN_PROGRESS') {
          throw new AppException(
            409,
            REASON_CODES.MISSION_ALREADY_IN_PROGRESS,
            'Mission cannot be cancelled after start',
          );
        }
        if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(mission.status)) {
          throw new AppException(
            409,
            REASON_CODES.RESOURCE_STATE_CONFLICT,
            'Mission cannot be cancelled from the current state',
          );
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
        await this.recordAudit({
          principal,
          mission,
          action: 'flight.request.cancel',
          permissionKey: 'flight.request.cancel',
          before,
          after: toMissionState(mission),
          session,
        });
        await this.appendMissionEvent({
          eventType: 'MissionCancelled.v1',
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

  async failMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    observations: string,
    idempotencyKey: string,
  ) {
    const trimmed = observations.trim();
    if (!trimmed) {
      throw new AppException(
        400,
        REASON_CODES.MISSION_FAILURE_OBSERVATION_REQUIRED,
        'Failure observations are required',
      );
    }
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.fail:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        if (!['READY', 'IN_PROGRESS'].includes(mission.status)) {
          throw new AppException(
            409,
            REASON_CODES.RESOURCE_STATE_CONFLICT,
            'Mission cannot fail from the current state',
          );
        }
        const before = toMissionState(mission);
        const now = new Date();
        mission.status = 'FAILED';
        mission.reviewStatus = 'NOT_READY';
        mission.failureObservations = trimmed;
        await mission.save({ session });
        const eventId = `MissionFailed.v1:${mission.id}:${idempotencyKey}`;
        await this.recordAudit({
          principal,
          mission,
          action: 'flight.request.fail',
          permissionKey: 'flight.request.complete',
          before,
          after: toMissionState(mission),
          metadata: { hasObservations: true },
          session,
        });
        await this.appendMissionEvent({
          eventType: 'MissionFailed.v1',
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
