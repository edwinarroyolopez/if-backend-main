import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ROLE_STATUSES, RoleStatus } from 'src/common/types/domain.types';

export type RoleDocument = Omit<HydratedDocument<Role>, 'id'> & { id: string };

@Schema({ collection: 'roles', timestamps: true })
export class Role {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: ROLE_STATUSES, default: 'ACTIVE' })
  status!: RoleStatus;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: Boolean, required: true, default: false })
  systemDefined!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ organizationId: 1, key: 1 }, { unique: true });
RoleSchema.index({ status: 1 });
