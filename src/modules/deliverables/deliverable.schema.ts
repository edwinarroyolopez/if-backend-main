import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  DELIVERABLE_STATUSES,
  DeliverableStatus,
} from 'src/common/types/domain.types';

export type DeliverableDocument = HydratedDocument<Deliverable>;

@Schema({ collection: 'deliverables', timestamps: true })
export class Deliverable {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: DELIVERABLE_STATUSES, default: 'DRAFT' })
  status!: DeliverableStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const DeliverableSchema = SchemaFactory.createForClass(Deliverable);

DeliverableSchema.index({ organizationId: 1, key: 1 }, { unique: true });
