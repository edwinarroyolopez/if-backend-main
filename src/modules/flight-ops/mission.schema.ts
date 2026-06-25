import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MISSION_STATUSES, MissionStatus } from 'src/common/types/domain.types';

export type MissionDocument = HydratedDocument<Mission>;

export const ASSIGNMENT_STATUSES = [
  'UNASSIGNED',
  'ASSIGNED',
  'ACCEPTED',
  'REJECTED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const REVIEW_STATUSES = [
  'NOT_READY',
  'PENDING_REVIEW',
  'REVIEWED_CLOSED',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MISSION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type MissionPriority = (typeof MISSION_PRIORITIES)[number];

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

  @Prop({ type: String, required: true, default: 'NOT_READY', index: true })
  reviewStatus!: ReviewStatus;

  @Prop({ type: String })
  buildingName?: string;

  @Prop({ type: String })
  address?: string;

  @Prop({ type: Object })
  coordinates?: { lat: number; lng: number };

  @Prop({ type: Object })
  scheduledWindow?: { startsAt: Date; endsAt?: Date };

  @Prop({ type: String, default: 'NORMAL', index: true })
  priority!: MissionPriority;

  @Prop({ type: String })
  customerServiceObservations?: string;

  @Prop({ type: String, default: null, index: true })
  assignedPilotId?: string | null;

  @Prop({ type: String, required: true, default: 'UNASSIGNED', index: true })
  assignmentStatus!: AssignmentStatus;

  @Prop({ type: Date })
  assignedAt?: Date;

  @Prop({ type: String })
  assignedBy?: string;

  @Prop({ type: Date })
  pilotAcceptedAt?: Date;

  @Prop({ type: Date })
  pilotRejectedAt?: Date;

  @Prop({ type: String })
  pilotRejectionObservations?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: String })
  startedBy?: string;

  @Prop({ type: Date })
  pilotCompletedAt?: Date;

  @Prop({ type: String })
  pilotObservations?: string;

  @Prop({ type: Date })
  reviewedClosedAt?: Date;

  @Prop({ type: String })
  reviewedClosedBy?: string;

  @Prop({ type: String })
  reviewObservations?: string;

  @Prop({ type: String })
  failureObservations?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: String })
  cancelledBy?: string;

  @Prop({ type: String })
  cancellationObservations?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: String })
  completedBy?: string;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const MissionSchema = SchemaFactory.createForClass(Mission);

MissionSchema.index({ organizationId: 1, key: 1 }, { unique: true });
MissionSchema.index({ organizationId: 1, projectId: 1, status: 1, createdAt: -1 });
MissionSchema.index({
  organizationId: 1,
  assignedPilotId: 1,
  status: 1,
  'scheduledWindow.startsAt': 1,
});
MissionSchema.index({ organizationId: 1, reviewStatus: 1, status: 1 });
MissionSchema.index({
  organizationId: 1,
  priority: 1,
  'scheduledWindow.startsAt': 1,
});
