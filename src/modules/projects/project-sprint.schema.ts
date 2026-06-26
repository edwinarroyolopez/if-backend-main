import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROJECT_SPRINT_STATUSES = [
  'PLANNING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ProjectSprintStatus = (typeof PROJECT_SPRINT_STATUSES)[number];

export type ProjectSprintDocument = Omit<
  HydratedDocument<ProjectSprint>,
  'id'
> & { id: string };

@Schema({ collection: 'project_sprints', timestamps: true })
export class ProjectSprint {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: '' })
  goal!: string;

  @Prop({ type: String, required: true, enum: PROJECT_SPRINT_STATUSES })
  status!: ProjectSprintStatus;

  @Prop({ type: String })
  startDate?: string;

  @Prop({ type: String })
  endDate?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: Boolean, required: true, default: false })
  active!: boolean;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectSprintSchema = SchemaFactory.createForClass(ProjectSprint);

ProjectSprintSchema.index({ organizationId: 1, projectId: 1, status: 1 });
ProjectSprintSchema.index(
  { organizationId: 1, projectId: 1, active: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
  },
);
