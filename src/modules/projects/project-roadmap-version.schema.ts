import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectRoadmapVersionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'ARCHIVED';

export type TraceableStatement = {
  key: string;
  statement: string;
  sourceReferences: Record<string, unknown>[];
};

export type ProjectRoadmapVersionDocument =
  HydratedDocument<ProjectRoadmapVersion>;

@Schema({ collection: 'project_roadmap_versions', timestamps: true })
export class ProjectRoadmapVersion {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  roadmapId!: string;

  @Prop({ type: String, required: true, index: true })
  snapshotId!: string;

  @Prop({ type: String, required: true })
  snapshotKey!: string;

  @Prop({ type: String, required: true })
  snapshotHash!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  versionLabel!: string;

  @Prop({ type: Number, required: true })
  versionNumber!: number;

  @Prop({ type: String, required: true })
  startDate!: string;

  @Prop({ type: String, required: true })
  endDate!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'],
    default: 'DRAFT',
  })
  status!: ProjectRoadmapVersionStatus;

  @Prop({ type: [Object], default: [] })
  planningAssumptions!: TraceableStatement[];

  @Prop({ type: [Object], default: [] })
  constraints!: TraceableStatement[];

  @Prop({ type: [Object], default: [] })
  horizons!: Record<string, unknown>[];

  @Prop({ type: [Object], default: [] })
  backlogCandidates!: Record<string, unknown>[];

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectRoadmapVersionSchema = SchemaFactory.createForClass(
  ProjectRoadmapVersion,
);

ProjectRoadmapVersionSchema.index(
  { organizationId: 1, projectId: 1, roadmapId: 1, versionNumber: 1 },
  { unique: true },
);
ProjectRoadmapVersionSchema.index({
  organizationId: 1,
  projectId: 1,
  status: 1,
});
