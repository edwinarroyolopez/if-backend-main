import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { OUTBOX_STATUSES, OutboxStatus } from 'src/common/types/domain.types';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

@Schema({ collection: 'outbox_events', timestamps: true })
export class OutboxEvent {
  @Prop({ type: String, required: true, unique: true })
  eventId!: string;

  @Prop({ type: String, required: true, index: true })
  eventType!: string;

  @Prop({ type: Number, required: true })
  eventVersion!: number;

  @Prop({ type: String, required: true, index: true })
  aggregateType!: string;

  @Prop({ type: String, required: true, index: true })
  aggregateId!: string;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ type: String, enum: OUTBOX_STATUSES, required: true, index: true })
  status!: OutboxStatus;

  @Prop({ type: Number, required: true, default: 0 })
  attemptCount!: number;

  @Prop({ type: Date, required: true, index: true })
  nextAttemptAt!: Date;

  @Prop({ type: String })
  lastError?: string;

  @Prop({ type: String, index: true })
  correlationId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

OutboxEventSchema.index({ status: 1, nextAttemptAt: 1 });
OutboxEventSchema.index({ aggregateType: 1, aggregateId: 1, createdAt: 1 });
OutboxEventSchema.index({ correlationId: 1 });
