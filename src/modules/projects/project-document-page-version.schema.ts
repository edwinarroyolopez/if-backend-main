import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ProjectDocumentChecklistItem,
  ProjectDocumentPageSource,
  ProjectDocumentPageStatus,
  ProjectDocumentPageType,
} from './project-document-page.schema';

export type ProjectDocumentPageVersionDocument =
  HydratedDocument<ProjectDocumentPageVersion>;

@Schema({ collection: 'project_document_page_versions', timestamps: true })
export class ProjectDocumentPageVersion {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  pageId!: string;

  @Prop({ type: Number, required: true })
  pageVersion!: number;

  @Prop({ type: String })
  parentPageId?: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  slug!: string;

  @Prop({ type: String })
  summary?: string;

  @Prop({ type: String })
  bodyMarkdown?: string;

  @Prop({ type: String, required: true })
  pageType!: ProjectDocumentPageType;

  @Prop({ type: String, required: true })
  status!: ProjectDocumentPageStatus;

  @Prop({ type: String, required: true })
  source!: ProjectDocumentPageSource;

  @Prop({ type: Number, required: true })
  sortOrder!: number;

  @Prop({
    type: [
      {
        id: { type: String },
        text: { type: String },
        required: { type: Boolean },
        completed: { type: Boolean },
      },
    ],
    default: [],
  })
  checklist!: ProjectDocumentChecklistItem[];

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

  @Prop({ type: String })
  sourceImportId?: string;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  @Prop({ type: String, required: true })
  changeType!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectDocumentPageVersionSchema = SchemaFactory.createForClass(
  ProjectDocumentPageVersion,
);

ProjectDocumentPageVersionSchema.index(
  { pageId: 1, pageVersion: 1 },
  { unique: true },
);
