import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROJECT_BACKLOG_ITEM_STATUSES = [
  'UNREFINED',
  'READY',
  'SELECTED_FOR_SPRINT',
  'ARCHIVED',
] as const;
export type ProjectBacklogItemStatus =
  (typeof PROJECT_BACKLOG_ITEM_STATUSES)[number];

export const PROJECT_BACKLOG_ITEM_TYPES = [
  'STORY',
  'TASK',
  'BUG',
  'SPIKE',
  'ENABLER',
] as const;
export type ProjectBacklogItemType =
  (typeof PROJECT_BACKLOG_ITEM_TYPES)[number];

export type ProjectBacklogItemDocument = HydratedDocument<ProjectBacklogItem>;

@Schema({ collection: 'project_backlog_items', timestamps: true })
export class ProjectBacklogItem {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  roadmapId!: string;

  @Prop({ type: String, required: true, index: true })
  roadmapVersionId!: string;

  @Prop({ type: String, required: true, index: true })
  milestoneId!: string;

  @Prop({ type: String, required: true })
  milestoneKey!: string;

  @Prop({ type: String, required: true })
  milestoneTitle!: string;

  @Prop({ type: String, required: true, index: true })
  epicId!: string;

  @Prop({ type: String, required: true })
  epicKey!: string;

  @Prop({ type: String, required: true })
  epicTitle!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, required: true, enum: PROJECT_BACKLOG_ITEM_TYPES })
  type!: ProjectBacklogItemType;

  @Prop({ type: Number, required: true })
  priority!: number;

  @Prop({ type: Object, required: true })
  estimate!: Record<string, unknown>;

  @Prop({ type: String, required: true, enum: PROJECT_BACKLOG_ITEM_STATUSES })
  status!: ProjectBacklogItemStatus;

  @Prop({ type: [String], default: [] })
  acceptanceCriteria!: string[];

  @Prop({ type: [Object], default: [] })
  sourceReferences!: Record<string, unknown>[];

  @Prop({ type: Object, required: true })
  traceability!: Record<string, unknown>;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: String })
  assigneeId?: string;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: String })
  sourceCandidateKey?: string;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  @Prop({ type: Date })
  archivedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectBacklogItemSchema =
  SchemaFactory.createForClass(ProjectBacklogItem);

ProjectBacklogItemSchema.index({ organizationId: 1, projectId: 1, order: 1 });
ProjectBacklogItemSchema.index({ organizationId: 1, projectId: 1, status: 1 });
ProjectBacklogItemSchema.index(
  {
    organizationId: 1,
    projectId: 1,
    roadmapVersionId: 1,
    sourceCandidateKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: { sourceCandidateKey: { $exists: true } },
  },
);
