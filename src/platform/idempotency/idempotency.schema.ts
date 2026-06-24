import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKeyRecord>;

@Schema({ collection: 'idempotency_keys', timestamps: true })
export class IdempotencyKeyRecord {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  operation!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'],
    index: true,
  })
  status!: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

  @Prop({ type: Number })
  responseStatusCode?: number;

  @Prop({ type: Object })
  responseBody?: Record<string, unknown>;

  @Prop({ type: Date, required: true, index: true })
  expiresAt!: Date;
}

export const IdempotencyKeySchema =
  SchemaFactory.createForClass(IdempotencyKeyRecord);

IdempotencyKeySchema.index(
  { organizationId: 1, key: 1, operation: 1 },
  { unique: true },
);
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
