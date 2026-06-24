import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RolePermissionDocument = HydratedDocument<RolePermission>;

@Schema({ collection: 'role_permissions', timestamps: true })
export class RolePermission {
  @Prop({ type: String, required: true, index: true })
  roleId!: string;

  @Prop({ type: String, required: true, index: true })
  permissionId!: string;
}

export const RolePermissionSchema =
  SchemaFactory.createForClass(RolePermission);

RolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });
