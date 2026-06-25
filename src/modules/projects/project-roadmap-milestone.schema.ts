import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectRoadmapMilestoneDocument =
  HydratedDocument<ProjectRoadmapMilestone>;

@Schema({ collection: 'project_roadmap_milestones', timestamps: true })
export class ProjectRoadmapMilestone {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  roadmapId!: string;

  @Prop({ type: String, required: true, index: true })
  roadmapVersionId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  horizonKey!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  objective!: string;

  @Prop({ type: String, required: true })
  targetDate!: string;

  @Prop({ type: String, required: true })
  status!: string;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: [String], default: [] })
  dependencies!: string[];

  @Prop({ type: [Object], default: [] })
  sourceReferences!: Record<string, unknown>[];
}

export const ProjectRoadmapMilestoneSchema = SchemaFactory.createForClass(
  ProjectRoadmapMilestone,
);

ProjectRoadmapMilestoneSchema.index(
  { roadmapVersionId: 1, key: 1 },
  { unique: true },
);
ProjectRoadmapMilestoneSchema.index({
  organizationId: 1,
  projectId: 1,
  order: 1,
});
