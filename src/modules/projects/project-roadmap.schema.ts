import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectRoadmapItem = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: 'PLANNED' | 'ACTIVE' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  owners?: string[];
  dependencies?: string[];
  deliveryRisk?: string;
};

export type ProjectRoadmapDocument = Omit<
  HydratedDocument<ProjectRoadmap>,
  'id'
> & { id: string };

@Schema({ collection: 'project_roadmaps', timestamps: true })
export class ProjectRoadmap {
  @Prop({ type: String, index: true })
  organizationId?: string;

  @Prop({ type: String, required: true, index: true, unique: true })
  projectId!: string;

  @Prop({ type: String, index: true })
  activeVersionId?: string;

  @Prop({ type: String, index: true })
  latestVersionId?: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['DRAFT', 'PLANNING', 'ACTIVE', 'REVIEW', 'ARCHIVED'],
    default: 'PLANNING',
  })
  status!: string;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: Number, required: false, min: 1 })
  horizonMonths?: number;

  @Prop({ type: String })
  notes?: string;

  @Prop({
    type: [
      {
        id: { type: String },
        title: { type: String },
        startDate: { type: String },
        endDate: { type: String },
        status: {
          type: String,
          enum: ['PLANNED', 'ACTIVE', 'DONE', 'BLOCKED', 'CANCELLED'],
        },
        owners: { type: [String], default: [] },
        dependencies: { type: [String], default: [] },
        deliveryRisk: { type: String },
      },
    ],
    default: [],
  })
  items!: ProjectRoadmapItem[];

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectRoadmapSchema =
  SchemaFactory.createForClass(ProjectRoadmap);
