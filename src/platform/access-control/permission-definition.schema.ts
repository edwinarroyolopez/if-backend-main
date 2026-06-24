import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PermissionDefinitionDocument =
  HydratedDocument<PermissionDefinition>;

@Schema({ collection: 'permission_definitions', timestamps: true })
export class PermissionDefinition {
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: String, required: true, index: true })
  moduleKey!: string;

  @Prop({ type: String, required: true })
  resourceKey!: string;

  @Prop({ type: String, required: true })
  actionKey!: string;

  @Prop({ type: String, default: 'ACTIVE', index: true })
  status!: 'ACTIVE' | 'REVOKED';

  @Prop({ type: String })
  description?: string;
}

export const PermissionDefinitionSchema =
  SchemaFactory.createForClass(PermissionDefinition);

PermissionDefinitionSchema.index({ moduleKey: 1, status: 1 });
