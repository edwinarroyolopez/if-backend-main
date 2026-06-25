import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROJECT_CONNECTOR_MIRROR_STATUSES = [
  'CREATED',
  'CONNECTED',
  'BLOCKED',
  'REVOKED',
] as const;
export type ProjectConnectorMirrorStatus =
  (typeof PROJECT_CONNECTOR_MIRROR_STATUSES)[number];

export type ProjectConnectorEndpointMirror = {
  id: string;
  key: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  status: 'ACTIVE';
};

export type ProjectConnectorMirrorDocument =
  HydratedDocument<ProjectConnectorMirror>;

@Schema({ collection: 'project_connector_mirrors', timestamps: true })
export class ProjectConnectorMirror {
  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, required: true, index: true })
  projectId!: string;

  @Prop({ type: String, required: true, index: true })
  remoteConnectionId!: string;

  @Prop({ type: String })
  remoteConnectorId?: string;

  @Prop({ type: String })
  connectorKey?: string;

  @Prop({ type: String })
  connectorName?: string;

  @Prop({ type: String, required: true })
  projectKey!: string;

  @Prop({ type: String, required: true })
  host!: string;

  @Prop({ type: String, select: false })
  apiKey?: string;

  @Prop({ type: String })
  apiKeyPrefix?: string;

  @Prop({ type: String, enum: PROJECT_CONNECTOR_MIRROR_STATUSES })
  status!: ProjectConnectorMirrorStatus;

  @Prop({ type: Date })
  connectedAt?: Date;

  @Prop({ type: Date })
  blockedAt?: Date;

  @Prop({ type: String })
  blockedReason?: string;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: String })
  revokeReason?: string;

  @Prop({ type: Date })
  lastSyncedAt?: Date;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: [Object], default: [] })
  endpoints!: ProjectConnectorEndpointMirror[];

  @Prop({ type: String, required: true })
  createdByUserId!: string;

  @Prop({ type: String })
  updatedByUserId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProjectConnectorMirrorSchema = SchemaFactory.createForClass(
  ProjectConnectorMirror,
);

ProjectConnectorMirrorSchema.index(
  { organizationId: 1, projectId: 1, remoteConnectionId: 1 },
  { unique: true },
);
ProjectConnectorMirrorSchema.index({
  organizationId: 1,
  projectId: 1,
  status: 1,
});
