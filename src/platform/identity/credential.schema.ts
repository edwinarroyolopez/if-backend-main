import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CREDENTIAL_STATUSES,
  CREDENTIAL_TYPES,
  CredentialStatus,
  CredentialType,
} from 'src/common/types/domain.types';

export type CredentialDocument = Omit<HydratedDocument<Credential>, 'id'> & {
  id: string;
};

@Schema({ collection: 'credentials', timestamps: true })
export class Credential {
  @Prop({ type: String, required: true, index: true })
  principalId!: string;

  @Prop({ type: String, enum: CREDENTIAL_TYPES, required: true })
  type!: CredentialType;

  @Prop({ type: String, select: false })
  passwordHash?: string;

  @Prop({ type: String, enum: CREDENTIAL_STATUSES, default: 'ACTIVE' })
  status!: CredentialStatus;

  @Prop({ type: Date })
  rotatedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CredentialSchema = SchemaFactory.createForClass(Credential);

CredentialSchema.index(
  { principalId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
    },
  },
);
