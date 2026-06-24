import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ROLE_ASSIGNMENT_STATUSES,
  RoleAssignmentStatus,
  SCOPE_TYPES,
  ScopeType,
} from 'src/common/types/domain.types';

export type RoleAssignmentDocument = HydratedDocument<RoleAssignment>;

@Schema({ collection: 'role_assignments', timestamps: true })
export class RoleAssignment {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['USER', 'TEAM', 'SERVICE_ACCOUNT'],
    index: true,
  })
  principalType!: 'USER' | 'TEAM' | 'SERVICE_ACCOUNT';

  @Prop({ type: String, required: true, index: true })
  principalId!: string;

  @Prop({ type: String, required: true, index: true })
  roleId!: string;

  @Prop({ type: String, required: true, enum: SCOPE_TYPES })
  scopeType!: ScopeType;

  @Prop({ type: String, required: true })
  scopeId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ROLE_ASSIGNMENT_STATUSES,
    default: 'ACTIVE',
    index: true,
  })
  status!: RoleAssignmentStatus;

  @Prop({ type: Date })
  validFrom?: Date;

  @Prop({ type: Date, index: true })
  validTo?: Date;

  @Prop({ type: String, required: true })
  assignedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RoleAssignmentSchema =
  SchemaFactory.createForClass(RoleAssignment);

RoleAssignmentSchema.index(
  { principalType: 1, principalId: 1, roleId: 1, scopeType: 1, scopeId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
  },
);
RoleAssignmentSchema.index({ principalType: 1, principalId: 1, status: 1 });
RoleAssignmentSchema.index({ scopeType: 1, scopeId: 1, status: 1 });
RoleAssignmentSchema.index({ roleId: 1, status: 1 });
RoleAssignmentSchema.index({ validTo: 1 });
