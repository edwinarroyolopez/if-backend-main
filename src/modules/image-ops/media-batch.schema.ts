import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  MEDIA_BATCH_STATUSES,
  MediaBatchStatus,
} from 'src/common/types/domain.types';

export type MediaBatchDocument = HydratedDocument<MediaBatch>;

@Schema({ collection: 'media_batches', timestamps: true })
export class MediaBatch {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  missionId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, enum: MEDIA_BATCH_STATUSES, default: 'PENDING_INGEST' })
  status!: MediaBatchStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const MediaBatchSchema = SchemaFactory.createForClass(MediaBatch);

MediaBatchSchema.index({ missionId: 1 }, { unique: true });
