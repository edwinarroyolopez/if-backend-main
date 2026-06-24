import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  OPPORTUNITY_STATUSES,
  OpportunityStatus,
} from 'src/common/types/domain.types';

export type OpportunityDocument = HydratedDocument<Opportunity>;

@Schema({ collection: 'opportunities', timestamps: true })
export class Opportunity {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  clientId!: string;

  @Prop({ type: String, index: true })
  projectId?: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: OPPORTUNITY_STATUSES, default: 'OPEN' })
  status!: OpportunityStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const OpportunitySchema = SchemaFactory.createForClass(Opportunity);
