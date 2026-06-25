import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectContextSnapshotDocument =
  HydratedDocument<ProjectContextSnapshot>;

@Schema({
  collection: 'project_context_snapshots',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ProjectContextSnapshot {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true })
  snapshotKey!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: [String], required: true })
  sourcePageIds!: string[];

  @Prop({ type: Object, required: true })
  sourcePageVersions!: Record<string, number>;

  @Prop({ type: String, required: true })
  approvedDocumentationHash!: string;

  @Prop({ type: String, required: true })
  contentSummary!: string;

  @Prop({ type: [String], default: [] })
  facts!: string[];

  @Prop({ type: [String], default: [] })
  assumptions!: string[];

  @Prop({ type: [String], default: [] })
  decisions!: string[];

  @Prop({ type: [String], default: [] })
  risks!: string[];

  @Prop({ type: [String], default: [] })
  openQuestions!: string[];

  @Prop({ type: [String], default: [] })
  constraints!: string[];

  @Prop({ type: String, required: true })
  createdBy!: string;

  createdAt!: Date;
}

export const ProjectContextSnapshotSchema = SchemaFactory.createForClass(
  ProjectContextSnapshot,
);

ProjectContextSnapshotSchema.index(
  { organizationId: 1, projectId: 1, snapshotKey: 1 },
  { unique: true },
);
ProjectContextSnapshotSchema.index({
  organizationId: 1,
  projectId: 1,
  createdAt: -1,
});
