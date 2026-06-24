import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MISSION_STATUSES, MissionStatus } from 'src/common/types/domain.types';

export type MissionDocument = HydratedDocument<Mission>;

@Schema({ collection: 'missions', timestamps: true })
export class Mission {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: MISSION_STATUSES, default: 'DRAFT', index: true })
  status!: MissionStatus;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: String })
  completedBy?: string;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const MissionSchema = SchemaFactory.createForClass(Mission);

MissionSchema.index({ organizationId: 1, key: 1 }, { unique: true });
