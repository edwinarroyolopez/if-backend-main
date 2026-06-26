import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROJECT_MEMBERSHIP_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'INACTIVE',
] as const;
export type ProjectMembershipStatus =
  (typeof PROJECT_MEMBERSHIP_STATUSES)[number];

export const PROJECT_MEMBERSHIP_ROLES = [
  'PROJECT_LEAD',
  'PRODUCT_OWNER',
  'ENGINEER',
  'DESIGNER',
  'QA',
  'STAKEHOLDER',
  'OBSERVER',
] as const;
export type ProjectMembershipRole = (typeof PROJECT_MEMBERSHIP_ROLES)[number];

export type ProjectMembershipDocument = Omit<
  HydratedDocument<ProjectMembership>,
  'id'
> & { id: string };

@Schema({ collection: 'project_memberships', timestamps: true })
export class ProjectMembership {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ type: String, required: true })
  displayName!: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String, index: true })
  emailNormalized?: string;

  @Prop({ type: String, required: true, enum: PROJECT_MEMBERSHIP_ROLES })
  role!: ProjectMembershipRole;

  @Prop({ type: Number, required: true })
  capacity!: number;

  @Prop({ type: String, required: true, enum: PROJECT_MEMBERSHIP_STATUSES })
  status!: ProjectMembershipStatus;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  @Prop({ type: Date })
  deactivatedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectMembershipSchema =
  SchemaFactory.createForClass(ProjectMembership);

ProjectMembershipSchema.index({ organizationId: 1, projectId: 1, status: 1 });
ProjectMembershipSchema.index(
  { organizationId: 1, projectId: 1, userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      userId: { $exists: true },
    },
  },
);
ProjectMembershipSchema.index(
  { organizationId: 1, projectId: 1, emailNormalized: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      emailNormalized: { $exists: true },
    },
  },
);
