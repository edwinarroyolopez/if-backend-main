import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  INVOICE_REQUEST_STATUSES,
  InvoiceRequestStatus,
} from 'src/common/types/domain.types';

export type InvoiceRequestDocument = HydratedDocument<InvoiceRequest>;

@Schema({ collection: 'invoice_requests', timestamps: true })
export class InvoiceRequest {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  clientId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: Number, required: true })
  amountCents!: number;

  @Prop({ type: String, required: true })
  currency!: string;

  @Prop({ type: String, enum: INVOICE_REQUEST_STATUSES, default: 'REQUESTED' })
  status!: InvoiceRequestStatus;

  @Prop({ type: String, required: true })
  requestedBy!: string;

  @Prop({ type: String })
  approvedBy?: string;
}

export const InvoiceRequestSchema =
  SchemaFactory.createForClass(InvoiceRequest);

InvoiceRequestSchema.index({ organizationId: 1, key: 1 }, { unique: true });
