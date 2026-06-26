import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { AuditService } from 'src/platform/audit/audit.service';
import {
  IfConnectorsRuntimeClient,
  RuntimeEndpointsResult,
} from './if-connectors-runtime.client';
import {
  applyRuntimeState,
  toAuditMirrorSnapshot,
  toProjectConnectorMirrorReadModel,
} from './project-connector-mirror.mapper';
import { ConnectProjectConnectorDto } from './project-connector-mirror.dto';
import {
  ProjectConnectorMirror,
  ProjectConnectorMirrorDocument,
} from './project-connector-mirror.schema';
import { ConnectorSecretCryptoService } from './connector-secret-crypto.service';
import {
  ProjectRecord,
  upsertMirrorFromRemote,
} from './project-connector-mirror-upsert';

@Injectable()
export class ProjectConnectorMirrorsService {
  constructor(
    @InjectModel(ProjectConnectorMirror.name)
    private readonly mirrorModel: HydratedModel<ProjectConnectorMirrorDocument>,
    private readonly projectsService: ProjectsService,
    private readonly runtimeClient: IfConnectorsRuntimeClient,
    private readonly secretCrypto: ConnectorSecretCryptoService,
    private readonly auditService: AuditService,
  ) {}

  async connect(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ConnectProjectConnectorDto,
  ) {
    const project = await this.getProject(
      projectId,
      requireActiveOrganizationId(principal),
    );
    const projectKey = normalizeProjectKey(input.projectKey);
    if (!projectKey) {
      throw new AppException(
        422,
        REASON_CODES.PROJECT_CONNECTOR_PROJECT_KEY_REQUIRED,
        'Project key is required',
      );
    }
    if (project.key !== projectKey) {
      throw new AppException(
        403,
        REASON_CODES.PROJECT_CONNECTOR_PROJECT_KEY_MISMATCH,
        'Connector project key does not match the local project',
      );
    }
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new AppException(
        422,
        REASON_CODES.PROJECT_CONNECTOR_API_KEY_REQUIRED,
        'Connector API key is required',
      );
    }
    const connectionId = input.connectionId.trim();
    if (!connectionId) {
      throw new AppException(
        422,
        REASON_CODES.PROJECT_CONNECTOR_CONNECTION_ID_REQUIRED,
        'Connector connection id is required',
      );
    }
    const host = normalizeHost(input.host);

    const remote = await this.runtimeClient.validateConnection({
      apiKey,
      connectionId,
      projectKey,
      host,
    });
    const mirror = await upsertMirrorFromRemote(
      { mirrorModel: this.mirrorModel, secretCrypto: this.secretCrypto },
      { principal, project, apiKey, host, remote },
    );
    await this.auditService.record({
      actorType: principal.principalType,
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      organizationId: project.organizationId,
      action: 'PROJECT_CONNECTOR_CONNECTED',
      resourceType: 'PROJECT_CONNECTOR_MIRROR',
      resourceId: mirror.id,
      permissionKey: 'projects.integration.manage',
      after: toAuditMirrorSnapshot(mirror),
    });

    return toProjectConnectorMirrorReadModel(mirror);
  }

  async list(principal: AuthenticatedPrincipal, projectId: string) {
    const project = await this.getProject(
      projectId,
      requireActiveOrganizationId(principal),
    );
    const mirrors = await this.mirrorModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ updatedAt: -1, _id: -1 });
    return {
      items: mirrors.map((mirror) => toProjectConnectorMirrorReadModel(mirror)),
    };
  }

  async get(
    principal: AuthenticatedPrincipal,
    projectId: string,
    mirrorId: string,
  ) {
    const project = await this.getProject(
      projectId,
      requireActiveOrganizationId(principal),
    );
    const mirror = await this.findMirror(project, mirrorId);
    return toProjectConnectorMirrorReadModel(mirror);
  }

  async sync(
    principal: AuthenticatedPrincipal,
    projectId: string,
    mirrorId: string,
  ) {
    const project = await this.getProject(
      projectId,
      requireActiveOrganizationId(principal),
    );
    const mirror = await this.findMirror(project, mirrorId, true);
    if (!mirror.apiKeyCiphertext) {
      throw new AppException(
        409,
        REASON_CODES.PROJECT_CONNECTOR_API_KEY_REQUIRED,
        'Connector mirror is missing its API key',
      );
    }

    let remote: RuntimeEndpointsResult;
    try {
      remote = await this.runtimeClient.listRuntimeEndpoints({
        apiKey: this.secretCrypto.decrypt(mirror.apiKeyCiphertext),
        connectionId: mirror.remoteConnectionId,
      });
    } catch (error) {
      if (
        error instanceof AppException &&
        error.reasonCode === REASON_CODES.PROJECT_CONNECTOR_REMOTE_REVOKED
      ) {
        mirror.status = 'REVOKED';
        mirror.revokedAt = mirror.revokedAt ?? new Date();
        mirror.revokeReason = 'Remote connection is revoked';
        mirror.updatedByUserId = principal.sub;
        await mirror.save();
        await this.recordSyncAudit(
          principal,
          mirror,
          'PROJECT_CONNECTOR_REVOKED_SYNCED',
        );
        return toProjectConnectorMirrorReadModel(mirror);
      }
      throw error;
    }

    applyRuntimeState(mirror, remote);
    mirror.updatedByUserId = principal.sub;
    await mirror.save();
    await this.recordSyncAudit(
      principal,
      mirror,
      mirror.status === 'BLOCKED'
        ? 'PROJECT_CONNECTOR_BLOCKED_SYNCED'
        : 'PROJECT_CONNECTOR_SYNCED',
    );

    return toProjectConnectorMirrorReadModel(mirror);
  }

  private async getProject(projectId: string, organizationId: string) {
    const project = await this.projectsService.findById(projectId);
    if (!project || project.organizationId !== organizationId) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return {
      id: project.id,
      organizationId: project.organizationId,
      key: project.key,
    };
  }

  private async findMirror(
    project: ProjectRecord,
    mirrorId: string,
    includeApiKey = false,
  ) {
    const query = this.mirrorModel.findOne({
      _id: mirrorId,
      organizationId: project.organizationId,
      projectId: project.id,
    });
    if (includeApiKey) {
      query.select('+apiKeyCiphertext');
    }
    const mirror = await query;
    if (!mirror) {
      throw new AppException(
        404,
        REASON_CODES.PROJECT_CONNECTOR_MIRROR_NOT_FOUND,
        'Project connector mirror was not found',
      );
    }
    return mirror;
  }

  private async recordSyncAudit(
    principal: AuthenticatedPrincipal,
    mirror: ProjectConnectorMirrorDocument,
    action: string,
  ) {
    await this.auditService.record({
      actorType: principal.principalType,
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      organizationId: mirror.organizationId,
      action,
      resourceType: 'PROJECT_CONNECTOR_MIRROR',
      resourceId: mirror.id,
      permissionKey: 'projects.integration.manage',
      after: toAuditMirrorSnapshot(mirror),
    });
  }
}

function normalizeProjectKey(projectKey: string) {
  return projectKey.trim();
}

function normalizeHost(host: string) {
  const normalized = host.trim().toLowerCase();
  if (!normalized || normalized.includes('/') || normalized.includes('?')) {
    throw new AppException(
      422,
      REASON_CODES.PROJECT_CONNECTOR_HOST_INVALID,
      'Connector host must be a host-only value',
    );
  }
  return normalized;
}

function requireActiveOrganizationId(principal: AuthenticatedPrincipal) {
  if (!principal.activeOrganizationId) {
    throw new AppException(
      403,
      REASON_CODES.PERMISSION_DENIED,
      'Active organization is required',
    );
  }
  return principal.activeOrganizationId;
}
