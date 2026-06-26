import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectDocumentationChecklistItem = {
  id: string;
  text: string;
  required: boolean;
  completed: boolean;
};

export type ProjectDocumentationDocument = Omit<
  HydratedDocument<ProjectDocumentation>,
  'id'
> & { id: string };

@Schema({ collection: 'project_documentations', timestamps: true })
export class ProjectDocumentation {
  @Prop({ type: String, required: true, index: true, unique: true })
  projectId!: string;

  @Prop({ type: String })
  parentPageId?: string;

  @Prop({ type: String, required: true })
  slug!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String })
  summary?: string;

  @Prop({ type: String })
  bodyMarkdown?: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'OVERVIEW',
      'OBJECTIVES',
      'SCOPE',
      'TECHNOLOGIES',
      'ARCHITECTURE',
      'TEAM',
      'RISKS',
      'DEPENDENCIES',
      'DELIVERABLES',
      'DECISIONS',
      'CUSTOM',
    ],
    default: 'OVERVIEW',
  })
  pageType!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED'],
    default: 'DRAFT',
  })
  status!: string;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: Number, required: true, default: 0 })
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
  checklist!: ProjectDocumentationChecklistItem[];

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectDocumentationSchema =
  SchemaFactory.createForClass(ProjectDocumentation);
