import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CLIENT_STATUSES, ClientStatus } from 'src/common/types/domain.types';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ collection: 'clients', timestamps: true })
export class Client {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: CLIENT_STATUSES, default: 'ACTIVE' })
  status!: ClientStatus;

  @Prop({ type: String, required: true })
  createdBy!: string;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.index({ organizationId: 1, key: 1 }, { unique: true });
