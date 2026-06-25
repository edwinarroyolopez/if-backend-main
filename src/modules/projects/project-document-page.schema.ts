import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROJECT_DOCUMENT_PAGE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;

export const PROJECT_DOCUMENT_PAGE_TYPES = [
  'OVERVIEW',
  'OBJECTIVES',
  'SCOPE',
  'TECHNOLOGIES',
  'REQUIREMENTS',
  'ARCHITECTURE',
  'TEAM',
  'DEPENDENCIES',
  'DELIVERABLES',
  'DELIVERY',
  'RISKS',
  'DECISIONS',
  'CUSTOM',
  'NOTES',
] as const;

export const PROJECT_DOCUMENT_PAGE_SOURCES = ['MANUAL', 'AI_IMPORT'] as const;

export type ProjectDocumentPageStatus =
  (typeof PROJECT_DOCUMENT_PAGE_STATUSES)[number];
export type ProjectDocumentPageType =
  (typeof PROJECT_DOCUMENT_PAGE_TYPES)[number];
export type ProjectDocumentPageSource =
  (typeof PROJECT_DOCUMENT_PAGE_SOURCES)[number];

export type ProjectDocumentChecklistItem = {
  id: string;
  text: string;
  required: boolean;
  completed: boolean;
};

export type ProjectDocumentPageDocument = HydratedDocument<ProjectDocumentPage>;

@Schema({ collection: 'project_document_pages', timestamps: true })
export class ProjectDocumentPage {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

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

  @Prop({
    type: String,
    required: true,
    enum: PROJECT_DOCUMENT_PAGE_TYPES,
    default: 'OVERVIEW',
  })
  pageType!: ProjectDocumentPageType;

  @Prop({
    type: String,
    required: true,
    enum: PROJECT_DOCUMENT_PAGE_STATUSES,
    default: 'DRAFT',
  })
  status!: ProjectDocumentPageStatus;

  @Prop({
    type: String,
    required: true,
    enum: PROJECT_DOCUMENT_PAGE_SOURCES,
    default: 'MANUAL',
  })
  source!: ProjectDocumentPageSource;

  @Prop({ type: Number, required: true, default: 0 })
  sortOrder!: number;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

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

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectDocumentPageSchema =
  SchemaFactory.createForClass(ProjectDocumentPage);

ProjectDocumentPageSchema.index(
  { organizationId: 1, projectId: 1, slug: 1 },
  { unique: true },
);
ProjectDocumentPageSchema.index({
  organizationId: 1,
  projectId: 1,
  sortOrder: 1,
});
