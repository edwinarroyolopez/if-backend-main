import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ProjectBacklogItemType } from './project-backlog-item.schema';

export const PROJECT_SPRINT_ITEM_BOARD_STATUSES = [
  'TO_DO',
  'IN_PROGRESS',
  'REVIEW',
  'BLOCKED',
  'DONE',
] as const;
export type ProjectSprintItemBoardStatus =
  (typeof PROJECT_SPRINT_ITEM_BOARD_STATUSES)[number];

export type ProjectSprintItemDocument = Omit<
  HydratedDocument<ProjectSprintItem>,
  'id'
> & { id: string };

@Schema({ collection: 'project_sprint_items', timestamps: true })
export class ProjectSprintItem {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  sprintId!: string;

  @Prop({ type: String, required: true, index: true })
  backlogItemId!: string;

  @Prop({ type: String, required: true })
  roadmapId!: string;

  @Prop({ type: String, required: true })
  roadmapVersionId!: string;

  @Prop({ type: String, required: true })
  milestoneId!: string;

  @Prop({ type: String, required: true })
  epicId!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, required: true })
  type!: ProjectBacklogItemType;

  @Prop({ type: Number, required: true })
  priority!: number;

  @Prop({ type: Object, required: true })
  estimate!: Record<string, unknown>;

  @Prop({
    type: String,
    required: true,
    enum: PROJECT_SPRINT_ITEM_BOARD_STATUSES,
  })
  boardStatus!: ProjectSprintItemBoardStatus;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: Number, required: true })
  sourceBacklogVersion!: number;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectSprintItemSchema =
  SchemaFactory.createForClass(ProjectSprintItem);

ProjectSprintItemSchema.index({ organizationId: 1, projectId: 1, sprintId: 1 });
ProjectSprintItemSchema.index({ sprintId: 1, boardStatus: 1, order: 1 });
ProjectSprintItemSchema.index(
  { organizationId: 1, projectId: 1, sprintId: 1, backlogItemId: 1 },
  { unique: true },
);
