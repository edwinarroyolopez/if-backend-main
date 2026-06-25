import {
  RuntimeEndpointMetadata,
  RuntimeEndpointsResult,
} from './if-connectors-runtime.client';
import {
  ProjectConnectorEndpointMirror,
  ProjectConnectorMirrorDocument,
  ProjectConnectorMirrorStatus,
} from './project-connector-mirror.schema';

export type ProjectConnectorMirrorReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  remoteConnectionId: string;
  remoteConnectorId?: string;
  connectorKey?: string;
  connectorName?: string;
  projectKey: string;
  host: string;
  apiKeyPrefix?: string;
  status: ProjectConnectorMirrorStatus;
  connectedAt?: string;
  blockedAt?: string;
  blockedReason?: string;
  revokedAt?: string;
  revokeReason?: string;
  lastSyncedAt?: string;
  lastUsedAt?: string;
  endpoints: ProjectConnectorEndpointMirror[];
  createdByUserId: string;
  updatedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function toProjectConnectorMirrorReadModel(
  mirror: ProjectConnectorMirrorDocument,
): ProjectConnectorMirrorReadModel {
  return {
    id: mirror.id,
    organizationId: mirror.organizationId,
    projectId: mirror.projectId,
    remoteConnectionId: mirror.remoteConnectionId,
    remoteConnectorId: mirror.remoteConnectorId,
    connectorKey: mirror.connectorKey,
    connectorName: mirror.connectorName,
    projectKey: mirror.projectKey,
    host: mirror.host,
    apiKeyPrefix: mirror.apiKeyPrefix,
    status: mirror.status,
    connectedAt: mirror.connectedAt?.toISOString(),
    blockedAt: mirror.blockedAt?.toISOString(),
    blockedReason: mirror.blockedReason,
    revokedAt: mirror.revokedAt?.toISOString(),
    revokeReason: mirror.revokeReason,
    lastSyncedAt: mirror.lastSyncedAt?.toISOString(),
    lastUsedAt: mirror.lastUsedAt?.toISOString(),
    endpoints: mirror.endpoints.map((endpoint) => ({ ...endpoint })),
    createdByUserId: mirror.createdByUserId,
    updatedByUserId: mirror.updatedByUserId,
    createdAt: mirror.createdAt?.toISOString(),
    updatedAt: mirror.updatedAt?.toISOString(),
  };
}

export function applyRuntimeState(
  mirror: ProjectConnectorMirrorDocument,
  remote: RuntimeEndpointsResult,
) {
  mirror.status = remote.connection.status;
  mirror.apiKeyPrefix = remote.connection.apiKeyPrefix ?? mirror.apiKeyPrefix;
  mirror.lastSyncedAt = toDate(remote.connection.lastSyncedAt) ?? new Date();
  mirror.lastUsedAt = toDate(remote.connection.lastUsedAt) ?? mirror.lastUsedAt;
  mirror.blockedReason = remote.connection.blockedReason;
  if (remote.connection.status === 'BLOCKED') {
    mirror.blockedAt = mirror.blockedAt ?? new Date();
  }
  if (remote.endpoints) {
    mirror.endpoints = toEndpointMirrors(remote.endpoints);
  }
}

export function toEndpointMirrors(
  endpoints: RuntimeEndpointMetadata[],
): ProjectConnectorEndpointMirror[] {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    key: endpoint.key,
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    status: endpoint.status,
  }));
}

export function toAuditMirrorSnapshot(mirror: ProjectConnectorMirrorDocument) {
  return {
    projectId: mirror.projectId,
    remoteConnectionId: mirror.remoteConnectionId,
    remoteConnectorId: mirror.remoteConnectorId,
    connectorKey: mirror.connectorKey,
    projectKey: mirror.projectKey,
    host: mirror.host,
    status: mirror.status,
    endpointCount: mirror.endpoints.length,
    apiKeyPrefix: mirror.apiKeyPrefix,
  };
}

export function toDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
