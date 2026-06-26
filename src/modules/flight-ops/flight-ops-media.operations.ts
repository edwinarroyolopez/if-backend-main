import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { assertUploadableMissionMedia } from './mission-media-file.policy';
import {
  UploadedMissionMediaAsset,
  UploadableFile,
} from './mission-media-storage.port';
import { MissionDocument } from './mission.schema';
import { FlightOpsStartOperations } from './flight-ops-start.operations';
import { toMediaDto } from './flight-ops-base.operations';

export abstract class FlightOpsMediaOperations extends FlightOpsStartOperations {
  async uploadMissionMedia(
    principal: AuthenticatedPrincipal,
    missionId: string,
    file: UploadableFile | undefined,
    idempotencyKey: string,
  ) {
    if (!file) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'File is required',
      );
    }
    assertUploadableMissionMedia(file);

    return this.runIdempotent(
      principal,
      idempotencyKey,
      `mission.media.upload:${missionId}`,
      async (recordId, session) => {
        const current = await this.findMissionOrThrow(missionId, session);
        this.assertAssignedPilot(principal, current);
        this.assertMediaUploadAllowed(current);
        const uploaded = await this.mediaStorage.uploadMissionMedia({
          file,
          organizationId: current.organizationId,
          missionId: current.id,
        });
        try {
          return await this.persistUploadedMissionMedia({
            principal,
            mission: current,
            uploaded,
            idempotencyKey,
            recordId,
            session,
          });
        } catch (error) {
          await this.compensateUploadedMissionMedia(uploaded);
          throw error;
        }
      },
    );
  }

  private async persistUploadedMissionMedia(input: {
    principal: AuthenticatedPrincipal;
    mission: MissionDocument;
    uploaded: UploadedMissionMediaAsset;
    idempotencyKey: string;
    recordId: string;
    session: ClientSession;
  }) {
    const { principal, mission, uploaded, idempotencyKey, recordId, session } =
      input;
    const now = new Date();
    const [asset] = await this.mediaAssetModel.create(
      [
        {
          organizationId: mission.organizationId,
          missionId: mission.id,
          cloudinaryPublicId: uploaded.storagePublicId,
          secureUrl: uploaded.secureUrl,
          resourceType: uploaded.resourceType,
          originalFilename: uploaded.originalFilename,
          uploadedBy: principal.sub,
          uploadedAt: now,
        },
      ],
      { session },
    );
    const eventId = `MissionMediaUploaded.v1:${mission.id}:${idempotencyKey}`;
    await this.recordAudit({
      principal,
      mission,
      action: 'flight.media.upload',
      permissionKey: 'flight.media.upload',
      after: { mediaAssetId: asset.id, resourceType: asset.resourceType },
      metadata: {
        mediaAssetId: asset.id,
        cloudinaryPublicId: asset.cloudinaryPublicId,
      },
      session,
    });
    await this.appendMissionEvent({
      eventType: 'MissionMediaUploaded.v1',
      eventId,
      mission,
      actorId: principal.sub,
      occurredAt: now,
      payload: { mediaAssetId: asset.id, resourceType: asset.resourceType },
      session,
    });
    const response = { ...toMediaDto(asset), eventId };
    await this.idempotencyService.complete(recordId, 200, response, session);
    return response;
  }

  private async compensateUploadedMissionMedia(
    uploaded: UploadedMissionMediaAsset,
  ) {
    try {
      await this.mediaStorage.deleteMissionMedia({
        storagePublicId: uploaded.storagePublicId,
        resourceType: uploaded.resourceType,
      });
    } catch {
      return;
    }
  }
}
