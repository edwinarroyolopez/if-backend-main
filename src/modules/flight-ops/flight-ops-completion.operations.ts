import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { FlightOpsMediaOperations } from './flight-ops-media.operations';
import { cleanOptional, toMissionState } from './flight-ops-base.operations';

export abstract class FlightOpsCompletionOperations extends FlightOpsMediaOperations {
  async completeMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    pilotObservations: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.pilot-complete:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        this.assertAssignedPilot(principal, mission);
        if (mission.status === 'COMPLETED') {
          const response = this.commandResponse(mission);
          await this.idempotencyService.complete(
            recordId,
            200,
            response,
            session,
          );
          return response;
        }
        if (mission.status !== 'IN_PROGRESS') {
          throw new AppException(
            409,
            REASON_CODES.MISSION_NOT_COMPLETABLE,
            'Mission cannot be completed from the current state',
          );
        }
        const mediaCount = await this.mediaAssetModel
          .countDocuments({ missionId: mission.id })
          .session(session);
        if (mediaCount === 0) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_MEDIA_REQUIRED,
            'Mission media is required before completion',
          );
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
        await this.mediaAssetModel.updateMany(
          { missionId: mission.id },
          { $set: { lockedAt: now } },
          { session },
        );
        const eventId = `MissionPilotCompleted.v1:${mission.id}:${idempotencyKey}`;
        await this.recordAudit({
          principal,
          mission,
          action: 'flight.request.complete',
          permissionKey: 'flight.request.complete',
          before,
          after: toMissionState(mission),
          metadata: { mediaCount },
          session,
        });
        await this.appendMissionEvent({
          eventType: 'MissionPilotCompleted.v1',
          eventId,
          mission,
          actorId: principal.sub,
          occurredAt: now,
          payload: { mediaCount },
          session,
        });
        const response = {
          ...this.commandResponse(mission, eventId),
          mediaCount,
        };
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

  async reviewCloseMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    reviewObservations: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.review-close:${missionId}`,
      async (recordId, session) => {
        const mission = await this.findMissionOrThrow(missionId, session);
        if (mission.assignedPilotId === principal.sub) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_REVIEW_REQUIRES_SEPARATE_ACTOR,
            'Review close requires a separate actor',
          );
        }
        if (
          mission.status !== 'COMPLETED' ||
          mission.reviewStatus !== 'PENDING_REVIEW'
        ) {
          throw new AppException(
            409,
            REASON_CODES.MISSION_REVIEW_NOT_READY,
            'Mission is not ready for review close',
          );
        }
        const before = toMissionState(mission);
        const now = new Date();
        mission.reviewStatus = 'REVIEWED_CLOSED';
        mission.reviewedClosedAt = now;
        mission.reviewedClosedBy = principal.sub;
        mission.reviewObservations = cleanOptional(reviewObservations);
        await mission.save({ session });
        const eventId = `MissionReviewedClosed.v1:${mission.id}:${idempotencyKey}`;
        await this.recordAudit({
          principal,
          mission,
          action: 'flight.request.review_close',
          permissionKey: 'flight.observation.write',
          before,
          after: toMissionState(mission),
          metadata: {
            reviewStatus: mission.reviewStatus,
            separateActorEnforced: true,
          },
          session,
        });
        await this.appendMissionEvent({
          eventType: 'MissionReviewedClosed.v1',
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
