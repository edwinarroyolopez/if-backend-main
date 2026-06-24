import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ServiceCredentialDocument = HydratedDocument<ServiceCredential>;

@Schema({ collection: 'service_credentials', timestamps: true })
export class ServiceCredential {
  @Prop({ type: String, required: true, index: true })
  serviceAccountId!: string;

  @Prop({ type: String, required: true })
  keyId!: string;

  @Prop({ type: String, required: true, default: 'CLIENT_SECRET' })
  credentialType!: 'CLIENT_SECRET';

  @Prop({ type: String, select: false })
  credentialHash?: string;

  @Prop({ type: String, required: true, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'REVOKED';

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Date })
  lastUsedAt?: Date;
}

export const ServiceCredentialSchema =
  SchemaFactory.createForClass(ServiceCredential);

ServiceCredentialSchema.index({ serviceAccountId: 1, status: 1 });
ServiceCredentialSchema.index({ expiresAt: 1 });
