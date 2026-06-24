import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  SERVICE_ACCOUNT_STATUSES,
  ServiceAccountStatus,
} from 'src/common/types/domain.types';

export type ServiceAccountDocument = HydratedDocument<ServiceAccount>;

@Schema({ collection: 'service_accounts', timestamps: true })
export class ServiceAccount {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  ownerModule!: string;

  @Prop({
    type: String,
    enum: SERVICE_ACCOUNT_STATUSES,
    default: 'ACTIVE',
  })
  status!: ServiceAccountStatus;

  @Prop({ type: Number, required: true, default: 0, index: true })
  sessionVersion!: number;

  @Prop({ type: Number, required: true, default: 0, index: true })
  authorizationVersion!: number;

  @Prop({ type: [String], required: true })
  allowedAudiences!: string[];

  @Prop({ type: [String], default: [] })
  allowedEnvironments!: string[];

  @Prop({ type: [String], default: [] })
  allowedIpRanges!: string[];
}

export const ServiceAccountSchema =
  SchemaFactory.createForClass(ServiceAccount);

ServiceAccountSchema.index({ organizationId: 1, key: 1 }, { unique: true });
ServiceAccountSchema.index({ status: 1 });
