import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_DECISIONS,
  AuditActorType,
  AuditDecision,
} from 'src/common/types/domain.types';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditLog {
  @Prop({ type: String, index: true })
  organizationId?: string;

  @Prop({ type: String, enum: AUDIT_ACTOR_TYPES, required: true, index: true })
  actorType!: AuditActorType;

  @Prop({ type: String, required: true, index: true })
  actorId!: string;

  @Prop({ type: String, index: true })
  actorSessionId?: string;

  @Prop({ type: String, required: true, index: true })
  action!: string;

  @Prop({ type: String, required: true, index: true })
  resourceType!: string;

  @Prop({ type: String, required: true, index: true })
  resourceId!: string;

  @Prop({ type: String })
  permissionKey?: string;

  @Prop({ type: String, enum: AUDIT_DECISIONS })
  decision?: AuditDecision;

  @Prop({ type: String })
  scopeType?: string;

  @Prop({ type: String })
  scopeId?: string;

  @Prop({ type: String })
  reasonCode?: string;

  @Prop({ type: String, index: true })
  requestId?: string;

  @Prop({ type: String, index: true })
  correlationId?: string;

  @Prop({ type: String })
  ipHash?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ correlationId: 1 });
