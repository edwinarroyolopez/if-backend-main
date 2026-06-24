import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PROJECT_STATUSES, ProjectStatus } from 'src/common/types/domain.types';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ collection: 'projects', timestamps: true })
export class Project {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  clientId!: string;

  @Prop({ type: String, index: true })
  opportunityId?: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: PROJECT_STATUSES, default: 'DRAFT' })
  status!: ProjectStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ organizationId: 1, key: 1 }, { unique: true });
