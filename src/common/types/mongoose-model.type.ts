import type { Model } from 'mongoose';

export type HydratedModel<TDocument> = Model<
  TDocument,
  object,
  object,
  object,
  TDocument
>;
