import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CrmService } from 'src/modules/crm/crm.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import {
  PrincipalAuthorizationService,
  ProjectCollectionAccess,
} from 'src/platform/access-control/principal-authorization.service';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import { Project, ProjectDocument } from './project.schema';

@Injectable()
export class ProjectsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly crmService: CrmService,
    private readonly accessControlService: AccessControlService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'PROJECT';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const project = await this.projectModel.findById(reference.resourceId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const moduleKey = reference.moduleKey ?? 'projects';
    return {
      resourceType: 'PROJECT',
      resourceId: project.id,
      organizationId: project.organizationId,
      moduleKey,
      projectId: project.id,
      projectAccessRoleIds: [...project.accessRoleIds],
      candidateScopes: [
        { type: 'PROJECT', id: project.id },
        { type: 'MODULE', id: moduleKey },
        { type: 'ORGANIZATION', id: project.organizationId },
      ],
    };
  }

  async createProject(
    input: {
      organizationId: string;
      clientId: string;
      opportunityId?: string;
      key: string;
      name: string;
      createdBy: string;
      accessRoleIds?: string[];
    },
    session: ClientSession,
  ) {
    const client = await this.crmService.findById(input.clientId);
    if (!client) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Client was not found',
      );
    }
    if (client.organizationId !== input.organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Client does not belong to the requested organization',
      );
    }

    const resolvedAccessRoleIds = await this.resolveAccessRoleIds(
      input.organizationId,
      input.accessRoleIds,
      session,
    );
    const [project] = await this.projectModel.create(
      [
        {
          organizationId: input.organizationId,
          clientId: input.clientId,
          opportunityId: input.opportunityId,
          key: input.key.trim(),
          name: input.name.trim(),
          status: 'DRAFT',
          accessRoleIds: resolvedAccessRoleIds,
          accessPolicyVersion: 1,
          createdBy: input.createdBy,
        },
      ],
      { session },
    );

    await this.auditService.record(
      {
        actorType: 'USER',
        actorId: input.createdBy,
        organizationId: project.organizationId,
        action: 'projects.project.create',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.create',
        after: {
          key: project.key,
          name: project.name,
          status: project.status,
          accessRoleIds: project.accessRoleIds,
        },
      },
      session,
    );
    return project;
  }

  async updateProjectAccessRoles(
    principal: AuthenticatedPrincipal,
    projectId: string,
    accessRoleIds: string[],
    session: ClientSession,
  ) {
    const project = await this.projectModel.findById(projectId).session(session);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const nextAccessRoleIds = await this.resolveAccessRoleIds(
      project.organizationId,
      accessRoleIds,
      session,
    );
    const previousAccessRoleIds = [...project.accessRoleIds].sort();
    const normalizedNextAccessRoleIds = [...nextAccessRoleIds].sort();
    if (
      previousAccessRoleIds.length === normalizedNextAccessRoleIds.length &&
      previousAccessRoleIds.every(
        (roleId, index) => roleId === normalizedNextAccessRoleIds[index],
      )
    ) {
      return project;
    }

    project.accessRoleIds = nextAccessRoleIds;
    project.accessPolicyVersion += 1;
    await project.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.assign_roles',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.assign_roles',
        before: { accessRoleIds: previousAccessRoleIds },
        after: {
          accessRoleIds: normalizedNextAccessRoleIds,
          accessPolicyVersion: project.accessPolicyVersion,
        },
      },
      session,
    );
    await this.accessControlService.touchGlobalAccessPolicy(session);
    return project;
  }

  async reconcileLegacyProjectAccessPolicies(
    organizationId: string,
    actorId: string,
    session: ClientSession,
  ) {
    const legacyProjects = await this.projectModel
      .find({
        organizationId,
        $or: [
          { accessRoleIds: { $exists: false } },
          { accessRoleIds: { $size: 0 } },
        ],
      })
      .session(session);
    if (legacyProjects.length === 0) {
      return 0;
    }

    const defaultAccessRoleIds = await this.accessControlService.listProjectReadableRoleIds(
      organizationId,
      session,
    );
    for (const project of legacyProjects) {
      project.accessRoleIds = defaultAccessRoleIds;
      project.accessPolicyVersion = Math.max(project.accessPolicyVersion ?? 0, 1);
      await project.save({ session });
      await this.auditService.record(
        {
          actorType: 'SYSTEM',
          actorId,
          organizationId: project.organizationId,
          action: 'projects.project.assign_roles',
          resourceType: 'PROJECT',
          resourceId: project.id,
          permissionKey: 'projects.project.assign_roles',
          before: { accessRoleIds: [] },
          after: {
            accessRoleIds: [...defaultAccessRoleIds],
            accessPolicyVersion: project.accessPolicyVersion,
          },
        },
        session,
      );
    }

    await this.accessControlService.touchGlobalAccessPolicy(session);
    return legacyProjects.length;
  }

  async listProjects(principal: AuthenticatedPrincipal) {
    const projects = await this.listAccessibleProjects(
      principal,
      'projects',
      'projects.project.read',
    );
    return projects.map((project) => this.toReadModel(project));
  }

  async listAccessibleProjectIds(
    principal: AuthenticatedPrincipal,
    moduleKey: string,
    permissionKey: string,
  ) {
    const projects = await this.listAccessibleProjects(
      principal,
      moduleKey,
      permissionKey,
    );
    return projects.map((project) => project.id);
  }

  async findById(projectId: string) {
    return this.projectModel.findById(projectId);
  }

  private async resolveAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[] | undefined,
    session: ClientSession,
  ) {
    const seedRoleIds =
      requestedRoleIds && requestedRoleIds.length > 0
        ? requestedRoleIds
        : await this.accessControlService.listProjectReadableRoleIds(
            organizationId,
            session,
          );
    if (seedRoleIds.length === 0) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'At least one active project-readable role is required',
      );
    }

    return this.accessControlService.resolveProjectAccessRoleIds(
      organizationId,
      seedRoleIds,
      session,
    );
  }

  private async listAccessibleProjects(
    principal: AuthenticatedPrincipal,
    moduleKey: string,
    permissionKey: string,
  ) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }

    const access = await this.principalAuthorizationService.getProjectCollectionAccess(
      principal,
      {
        organizationId,
        moduleKey,
        permissionKey,
      },
    );
    const explicitProjectIds = Object.keys(access.projectScopedRoleIdsByProjectId);
    if (access.broadRoleIds.length === 0 && explicitProjectIds.length === 0) {
      return [];
    }

    const query: {
      organizationId: string;
      accessRoleIds?: { $in: string[] };
      _id?: { $in: string[] };
      $or?: Array<Record<string, unknown>>;
    } = { organizationId };
    if (access.broadRoleIds.length > 0 && explicitProjectIds.length > 0) {
      query.$or = [
        { accessRoleIds: { $in: access.broadRoleIds } },
        { _id: { $in: explicitProjectIds } },
      ];
    } else if (access.broadRoleIds.length > 0) {
      query.accessRoleIds = { $in: access.broadRoleIds };
    } else {
      query._id = { $in: explicitProjectIds };
    }

    const projects = await this.projectModel.find(query).sort({ createdAt: -1 });
    return projects.filter((project) => projectMatchesAccess(project, access));
  }

  private toReadModel(project: ProjectDocument) {
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      clientId: project.clientId,
      status: project.status,
      accessRoleIds: [...project.accessRoleIds],
    };
  }
}

function projectMatchesAccess(
  project: ProjectDocument,
  access: ProjectCollectionAccess,
) {
  if (project.accessRoleIds.some((roleId) => access.broadRoleIds.includes(roleId))) {
    return true;
  }

  const scopedRoleIds = access.projectScopedRoleIdsByProjectId[project.id] ?? [];
  return project.accessRoleIds.some((roleId) => scopedRoleIds.includes(roleId));
}
