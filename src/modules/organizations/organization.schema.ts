import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ORGANIZATION_STATUSES,
  OrganizationStatus,
} from 'src/common/types/domain.types';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: ORGANIZATION_STATUSES, default: 'ACTIVE' })
  status!: OrganizationStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
