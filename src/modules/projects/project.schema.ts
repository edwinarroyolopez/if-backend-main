import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PROJECT_HEALTH_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from 'src/common/types/domain.types';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ collection: 'projects', timestamps: true })
export class Project {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({
    type: String,
    enum: PROJECT_KINDS,
    required: true,
    default: 'CLIENT',
  })
  projectKind!: ProjectKind;

  @Prop({ type: String, index: true })
  clientId?: string;

  @Prop({ type: String, index: true })
  opportunityId?: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  objective?: string;

  @Prop({ type: String, index: true })
  ownerUserId?: string;

  @Prop({ type: String, enum: PROJECT_STATUSES, default: 'DRAFT' })
  status!: ProjectStatus;

  @Prop({ type: String, enum: PROJECT_HEALTH_STATUSES, default: 'ON_TRACK' })
  health!: ProjectHealth;

  @Prop({ type: String })
  healthReason?: string;

  @Prop({ type: Date })
  healthUpdatedAt?: Date;

  @Prop({ type: String })
  healthUpdatedBy?: string;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  targetDate?: Date;

  @Prop({ type: [String], default: [] })
  accessRoleIds!: string[];

  @Prop({ type: Number, required: true, default: 1 })
  accessPolicyVersion!: number;

  @Prop({ type: String, required: true })
  createdBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ organizationId: 1, key: 1 }, { unique: true });
ProjectSchema.index({ organizationId: 1, accessRoleIds: 1 });
ProjectSchema.index({ organizationId: 1, projectKind: 1 });
ProjectSchema.index(
  { organizationId: 1, clientId: 1 },
  { partialFilterExpression: { clientId: { $exists: true } } },
);
