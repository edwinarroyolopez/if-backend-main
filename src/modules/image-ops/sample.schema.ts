import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SAMPLE_STATUSES, SampleStatus } from 'src/common/types/domain.types';

export type SampleDocument = HydratedDocument<Sample>;

@Schema({ collection: 'samples', timestamps: true })
export class Sample {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true })
  mediaBatchId!: string;

  @Prop({ type: String, required: true, index: true })
  missionId!: string;

  @Prop({ type: String, enum: SAMPLE_STATUSES, default: 'PENDING' })
  status!: SampleStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String })
  approvedBy?: string;
}

export const SampleSchema = SchemaFactory.createForClass(Sample);

SampleSchema.index({ mediaBatchId: 1 }, { unique: true });
