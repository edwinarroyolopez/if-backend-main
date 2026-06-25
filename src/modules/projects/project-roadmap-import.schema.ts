import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectRoadmapImportDocument =
  HydratedDocument<ProjectRoadmapImport>;

@Schema({ collection: 'project_roadmap_imports', timestamps: true })
export class ProjectRoadmapImport {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  snapshotId!: string;

  @Prop({ type: String, required: true, index: true })
  previewToken!: string;

  @Prop({ type: String, required: true })
  importHash!: string;

  @Prop({ type: String, required: true })
  status!: 'COMMITTED';

  @Prop({ type: String, required: true })
  roadmapId!: string;

  @Prop({ type: String, required: true })
  roadmapVersionId!: string;

  @Prop({ type: String, required: true })
  createdBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectRoadmapImportSchema =
  SchemaFactory.createForClass(ProjectRoadmapImport);

ProjectRoadmapImportSchema.index(
  { organizationId: 1, projectId: 1, previewToken: 1 },
  { unique: true },
);
