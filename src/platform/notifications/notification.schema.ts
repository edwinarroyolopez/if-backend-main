import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationDocument = Omit<
  HydratedDocument<Notification>,
  'id'
> & { id: string };

@Schema({
  collection: 'notifications',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Notification {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, index: true })
  type!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  body!: string;

  @Prop({ type: String, required: true, index: true })
  resourceType!: string;

  @Prop({ type: String, required: true, index: true })
  resourceId!: string;

  @Prop({ type: String, required: true })
  eventId!: string;

  @Prop({ type: Date, index: true })
  readAt?: Date;

  createdAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({
  organizationId: 1,
  userId: 1,
  readAt: 1,
  createdAt: -1,
});
NotificationSchema.index(
  { organizationId: 1, userId: 1, eventId: 1 },
  { unique: true },
);
