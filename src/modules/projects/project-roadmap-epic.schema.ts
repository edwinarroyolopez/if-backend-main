import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectRoadmapEpicDocument = HydratedDocument<ProjectRoadmapEpic>;

@Schema({ collection: 'project_roadmap_epics', timestamps: true })
export class ProjectRoadmapEpic {
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
  milestoneKey!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  objective!: string;

  @Prop({ type: String, required: true })
  expectedOutcome!: string;

  @Prop({ type: Number, required: true })
  priority!: number;

  @Prop({ type: String, required: true })
  status!: string;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: Object, required: true })
  estimate!: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  dependencies!: string[];

  @Prop({ type: [Object], default: [] })
  sourceReferences!: Record<string, unknown>[];
}

export const ProjectRoadmapEpicSchema =
  SchemaFactory.createForClass(ProjectRoadmapEpic);

ProjectRoadmapEpicSchema.index(
  { roadmapVersionId: 1, key: 1 },
  { unique: true },
);
ProjectRoadmapEpicSchema.index({ organizationId: 1, projectId: 1, order: 1 });
