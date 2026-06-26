import { MissionMediaResourceType } from './mission-media-asset.schema';

export type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size?: number;
};

export type UploadedMissionMediaAsset = {
  storagePublicId: string;
  secureUrl: string;
  resourceType: MissionMediaResourceType;
  originalFilename?: string;
};

export abstract class MissionMediaStoragePort {
  abstract uploadMissionMedia(input: {
    file: UploadableFile;
    organizationId: string;
    missionId: string;
  }): Promise<UploadedMissionMediaAsset>;

  abstract deleteMissionMedia(input: {
    storagePublicId: string;
    resourceType: MissionMediaResourceType;
  }): Promise<void>;
}
