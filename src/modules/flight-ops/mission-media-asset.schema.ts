import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MissionMediaAssetDocument = HydratedDocument<MissionMediaAsset>;

export const MISSION_MEDIA_RESOURCE_TYPES = ['image', 'video'] as const;
export type MissionMediaResourceType =
  (typeof MISSION_MEDIA_RESOURCE_TYPES)[number];

@Schema({ collection: 'mission_media_assets', timestamps: true })
export class MissionMediaAsset {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  missionId!: string;

  @Prop({ type: String, required: true, unique: true })
  cloudinaryPublicId!: string;

  @Prop({ type: String, required: true })
  secureUrl!: string;

  @Prop({ type: String, required: true, enum: MISSION_MEDIA_RESOURCE_TYPES })
  resourceType!: MissionMediaResourceType;

  @Prop({ type: String })
  originalFilename?: string;

  @Prop({ type: String, required: true, index: true })
  uploadedBy!: string;

  @Prop({ type: Date, required: true, index: true })
  uploadedAt!: Date;

  @Prop({ type: Date })
  lockedAt?: Date;
}

export const MissionMediaAssetSchema =
  SchemaFactory.createForClass(MissionMediaAsset);

MissionMediaAssetSchema.index({
  organizationId: 1,
  missionId: 1,
  uploadedAt: -1,
});
