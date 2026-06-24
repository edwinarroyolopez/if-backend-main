import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccessPolicyDocument = HydratedDocument<AccessPolicy>;

@Schema({ collection: 'access_policies', timestamps: true })
export class AccessPolicy {
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;
}

export const AccessPolicySchema = SchemaFactory.createForClass(AccessPolicy);
