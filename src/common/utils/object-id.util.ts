import { Types } from 'mongoose';

export function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}
