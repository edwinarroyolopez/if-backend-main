import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { USER_STATUSES, UserStatus } from 'src/common/types/domain.types';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, unique: true, trim: true })
  normalizedEmail!: string;

  @Prop({ type: String, required: true, trim: true })
  displayName!: string;

  @Prop({ type: String, enum: USER_STATUSES, default: 'ACTIVE' })
  status!: UserStatus;

  @Prop({ type: Number, required: true, default: 0, index: true })
  sessionVersion!: number;

  @Prop({ type: Number, required: true, default: 0, index: true })
  authorizationVersion!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ status: 1 });
