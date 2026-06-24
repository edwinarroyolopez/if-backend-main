import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PRINCIPAL_TYPES,
  SESSION_KINDS,
  PrincipalType,
  SessionKind,
} from 'src/common/types/domain.types';

export type AuthSessionDocument = HydratedDocument<AuthSession>;

@Schema({ collection: 'auth_sessions', timestamps: true })
export class AuthSession {
  @Prop({ type: String, enum: PRINCIPAL_TYPES, required: true, index: true })
  principalType!: PrincipalType;

  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ type: String, index: true })
  serviceAccountId?: string;

  @Prop({ type: String, enum: SESSION_KINDS, required: true, index: true })
  sessionKind!: SessionKind;

  @Prop({ type: String, select: false })
  refreshTokenHash?: string;

  @Prop({ type: Number, required: true, index: true })
  sessionVersion!: number;

  @Prop({ type: Number, required: true, index: true })
  authorizationVersion!: number;

  @Prop({ type: Date, required: true, index: true })
  expiresAt!: Date;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: String })
  revokeReason?: string;

  @Prop({ type: String })
  replacedBySessionId?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: String })
  ipHash?: string;

  @Prop({ type: String })
  deviceId?: string;

  @Prop({ type: Boolean, required: true, default: false })
  readOnly!: boolean;

  @Prop({ type: String })
  impersonatedByAdminUserId?: string;

  @Prop({ type: String })
  targetUserId?: string;

  @Prop({ type: String })
  activeOrganizationId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);

AuthSessionSchema.index(
  { refreshTokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { refreshTokenHash: { $exists: true } },
  },
);
AuthSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
AuthSessionSchema.index({ serviceAccountId: 1, revokedAt: 1, expiresAt: 1 });
AuthSessionSchema.index({ expiresAt: 1 });
AuthSessionSchema.index({ sessionKind: 1 });
