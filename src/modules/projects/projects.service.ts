import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import {
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from 'src/common/types/domain.types';
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
import { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
import {
  buildProjectReadiness,
  canTransitionProject,
  normalizeProjectKey,
  normalizeProjectKind,
  ProjectReadiness,
} from './project-foundation.policy';
import { Project, ProjectDocument } from './project.schema';
import {
  ProjectDocumentation,
  ProjectDocumentationChecklistItem,
  ProjectDocumentationDocument,
} from './project-documentation.schema';
import {
  ProjectRoadmap,
  ProjectRoadmapDocument,
  ProjectRoadmapItem,
} from './project-roadmap.schema';

type ProjectDocumentationUpdate = {
  parentPageId?: string;
  slug?: string;
  title?: string;
  summary?: string;
  bodyMarkdown?: string;
  pageType?:
    | 'OVERVIEW'
    | 'OBJECTIVES'
    | 'SCOPE'
    | 'TECHNOLOGIES'
    | 'ARCHITECTURE'
    | 'TEAM'
    | 'RISKS'
    | 'DEPENDENCIES'
    | 'DELIVERABLES'
    | 'DECISIONS'
    | 'CUSTOM';
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';
  sortOrder?: number;
  checklist?: ProjectDocumentationChecklistItem[];
};

type ProjectRoadmapUpdate = {
  title?: string;
  status?: 'DRAFT' | 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'ARCHIVED';
  horizonMonths?: number;
  notes?: string;
  items?: ProjectRoadmapItem[];
};

type CreateProjectInput = {
  organizationId: string;
  projectKind?: ProjectKind;
  clientId?: string;
  opportunityId?: string;
  key: string;
  name: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  startDate?: string;
  targetDate?: string;
  createdBy: string;
  accessRoleIds?: string[];
};

type UpdateProjectDetailsInput = {
  name?: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  startDate?: string;
  targetDate?: string;
};

export type ProjectReadModel = {
  id: string;
  organizationId: string;
  projectKind: ProjectKind;
  clientId?: string;
  opportunityId?: string;
  key: string;
  name: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  status: ProjectStatus;
  health: ProjectHealth;
  healthReason?: string;
  healthUpdatedAt?: string;
  healthUpdatedBy?: string;
  startDate?: string;
  targetDate?: string;
  accessRoleIds: string[];
  accessPolicyVersion: number;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable()
export class ProjectsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(ProjectDocumentation.name)
    private readonly projectDocumentationModel: Model<ProjectDocumentationDocument>,
    @InjectModel(ProjectRoadmap.name)
    private readonly projectRoadmapModel: Model<ProjectRoadmapDocument>,
    private readonly crmService: CrmService,
    private readonly accessControlService: AccessControlService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
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

  async createProjectForRequest(
    input: CreateProjectInput,
    idempotencyKey: string,
    session: ClientSession,
  ): Promise<ProjectReadModel> {
    const operation = `projects.project.create:${normalizeProjectKey(input.key)}`;
    const begun = await this.idempotencyService.begin(
      input.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceProjectReadModel(begun.record.responseBody);
      if (response) {
        return response;
      }

      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent project response is not reusable',
      );
    }

    const project = await this.createProject(input, session);
    const response = this.toReadModel(project);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      { ...response },
      session,
    );

    return response;
  }

  async createProject(input: CreateProjectInput, session: ClientSession) {
    const projectKind = normalizeProjectKind(input.projectKind);
    const clientId = await this.resolveProjectClientId(
      projectKind,
      input.clientId,
      input.organizationId,
    );

    const resolvedAccessRoleIds = await this.resolveAccessRoleIds(
      input.organizationId,
      input.accessRoleIds,
      session,
    );
    let project: ProjectDocument;
    try {
      [project] = await this.projectModel.create(
        [
          {
            organizationId: input.organizationId,
            projectKind,
            clientId,
            opportunityId: input.opportunityId,
            key: normalizeProjectKey(input.key),
            name: input.name.trim(),
            description: normalizeOptionalText(input.description),
            objective: normalizeOptionalText(input.objective),
            ownerUserId: normalizeOptionalText(input.ownerUserId),
            status: 'DRAFT',
            health: 'ON_TRACK',
            startDate: parseProjectDate(input.startDate),
            targetDate: parseProjectDate(input.targetDate),
            accessRoleIds: resolvedAccessRoleIds,
            accessPolicyVersion: 1,
            createdBy: input.createdBy,
          },
        ],
        { session },
      );
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Project key already exists in this organization',
          { field: 'key' },
        );
      }

      throw error;
    }

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
          projectKind: project.projectKind,
          clientId: project.clientId,
          status: project.status,
          health: project.health,
          accessRoleIds: project.accessRoleIds,
        },
      },
      session,
    );
    return project;
  }

  async updateProjectDetails(
    principal: AuthenticatedPrincipal,
    projectId: string,
    updates: UpdateProjectDetailsInput,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const before = this.toProjectAuditSnapshot(project);
    const changed = applyProjectDetails(project, updates);
    if (!changed) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No project updates were provided',
      );
    }

    await project.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.update',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.update',
        before,
        after: this.toProjectAuditSnapshot(project),
      },
      session,
    );

    return project;
  }

  async transitionProject(
    principal: AuthenticatedPrincipal,
    projectId: string,
    targetStatus: ProjectStatus,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    if (!canTransitionProject(project.status, targetStatus)) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        `Project cannot transition from ${project.status} to ${targetStatus}`,
        { currentStatus: project.status, targetStatus },
      );
    }

    const before = { status: project.status };
    project.status = targetStatus;
    await project.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.transition',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.transition',
        before,
        after: { status: project.status },
      },
      session,
    );

    return project;
  }

  async updateProjectHealth(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: { health: ProjectHealth; healthReason?: string },
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const before = {
      health: project.health,
      healthReason: project.healthReason,
      healthUpdatedAt: project.healthUpdatedAt?.toISOString(),
      healthUpdatedBy: project.healthUpdatedBy,
    };
    const now = new Date();
    project.health = input.health;
    project.healthReason = normalizeOptionalText(input.healthReason);
    project.healthUpdatedAt = now;
    project.healthUpdatedBy = principal.sub;
    await project.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.health',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.health',
        before,
        after: {
          health: project.health,
          healthReason: project.healthReason,
          healthUpdatedAt: now.toISOString(),
          healthUpdatedBy: project.healthUpdatedBy,
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
    const project = await this.projectModel
      .findById(projectId)
      .session(session);
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

  async updateProjectDocumentation(
    principal: AuthenticatedPrincipal,
    projectId: string,
    updates: ProjectDocumentationUpdate,
    session: ClientSession,
  ) {
    const project = await this.projectModel
      .findById(projectId)
      .session(session);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const documentation = await this.ensureProjectDocumentation(
      project,
      principal.sub,
      session,
    );
    const before = this.toProjectDocumentationSnapshot(documentation);
    const hasChanges = this.applyProjectDocumentationUpdates(
      documentation,
      updates,
    );
    if (!hasChanges) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No documentation updates were provided',
      );
    }

    documentation.version += 1;
    documentation.updatedBy = principal.sub;
    await documentation.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.update',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.update',
        before: { ...before, section: 'documentation' },
        after: {
          ...this.toProjectDocumentationSnapshot(documentation),
          section: 'documentation',
        },
      },
      session,
    );
    return documentation;
  }

  async updateProjectRoadmap(
    principal: AuthenticatedPrincipal,
    projectId: string,
    updates: ProjectRoadmapUpdate,
    session: ClientSession,
  ) {
    const project = await this.projectModel
      .findById(projectId)
      .session(session);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const roadmap = await this.ensureProjectRoadmap(
      project,
      principal.sub,
      session,
    );
    const before = this.toProjectRoadmapSnapshot(roadmap);
    const hasChanges = this.applyProjectRoadmapUpdates(roadmap, updates);
    if (!hasChanges) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No roadmap updates were provided',
      );
    }

    roadmap.version += 1;
    roadmap.updatedBy = principal.sub;
    await roadmap.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.project.update',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.project.update',
        before: { ...before, section: 'roadmap' },
        after: {
          ...this.toProjectRoadmapSnapshot(roadmap),
          section: 'roadmap',
        },
      },
      session,
    );
    return roadmap;
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

    const defaultAccessRoleIds =
      await this.accessControlService.listProjectReadableRoleIds(
        organizationId,
        session,
      );
    for (const project of legacyProjects) {
      project.accessRoleIds = defaultAccessRoleIds;
      project.accessPolicyVersion = Math.max(
        project.accessPolicyVersion ?? 0,
        1,
      );
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

  async getProjectReadiness(projectId: string): Promise<ProjectReadiness> {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const documentation = await this.projectDocumentationModel.findOne({
      projectId: project.id,
    });
    const roadmap = await this.projectRoadmapModel.findOne({
      projectId: project.id,
    });
    const hasUsefulDocumentation = Boolean(
      documentation &&
        ((documentation.bodyMarkdown?.trim().length ?? 0) > 0 ||
          documentation.checklist.length > 0),
    );

    return buildProjectReadiness({
      hasUsefulDocumentation,
      requiredDocumentationApproved: documentation?.status === 'APPROVED',
      hasActiveRoadmap: roadmap?.status === 'ACTIVE',
      hasReadyBacklog: false,
      hasMinimumTeam: false,
    });
  }

  private async resolveAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[] | undefined,
    session: ClientSession,
  ) {
    if (!requestedRoleIds || requestedRoleIds.length === 0) {
      const readableRoleIds =
        await this.accessControlService.listProjectReadableRoleIds(
          organizationId,
          session,
        );
      if (readableRoleIds.length === 0) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'At least one active project-readable role is required',
        );
      }

      return readableRoleIds;
    }

    return this.accessControlService.resolveProjectAccessRoleIds(
      organizationId,
      requestedRoleIds,
      session,
    );
  }

  private async resolveProjectClientId(
    projectKind: ProjectKind,
    clientId: string | undefined,
    organizationId: string,
  ) {
    if (!clientId) {
      if (projectKind === 'CLIENT') {
        throw new AppException(
          400,
          REASON_CODES.VALIDATION_FAILED,
          'clientId is required for CLIENT projects',
          { field: 'clientId' },
        );
      }

      return undefined;
    }

    const client = await this.crmService.findById(clientId);
    if (!client) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Client was not found',
        { field: 'clientId' },
      );
    }
    if (client.organizationId !== organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Client does not belong to the requested organization',
        { field: 'clientId' },
      );
    }

    return clientId;
  }

  private async getProjectForWrite(projectId: string, session: ClientSession) {
    const project = await this.projectModel.findById(projectId).session(session);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    return project;
  }

  async getProjectDocumentation(projectId: string, actorId: string) {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    return this.ensureProjectDocumentation(project, actorId);
  }

  async getProjectRoadmap(projectId: string, actorId: string) {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    return this.ensureProjectRoadmap(project, actorId);
  }

  private applyProjectDocumentationUpdates(
    documentation: ProjectDocumentationDocument,
    updates: ProjectDocumentationUpdate,
  ) {
    let changed = false;

    if (
      updates.parentPageId !== undefined &&
      updates.parentPageId !== documentation.parentPageId
    ) {
      documentation.parentPageId = updates.parentPageId;
      changed = true;
    }
    if (updates.slug !== undefined && updates.slug !== documentation.slug) {
      documentation.slug = updates.slug;
      changed = true;
    }
    if (updates.title !== undefined && updates.title !== documentation.title) {
      documentation.title = updates.title;
      changed = true;
    }
    if (
      updates.summary !== undefined &&
      updates.summary !== documentation.summary
    ) {
      documentation.summary = updates.summary;
      changed = true;
    }
    if (
      updates.bodyMarkdown !== undefined &&
      updates.bodyMarkdown !== documentation.bodyMarkdown
    ) {
      documentation.bodyMarkdown = updates.bodyMarkdown;
      changed = true;
    }
    if (
      updates.pageType !== undefined &&
      updates.pageType !== documentation.pageType
    ) {
      documentation.pageType = updates.pageType;
      changed = true;
    }
    if (
      updates.status !== undefined &&
      updates.status !== documentation.status
    ) {
      documentation.status = updates.status;
      changed = true;
    }
    if (
      updates.sortOrder !== undefined &&
      updates.sortOrder !== documentation.sortOrder
    ) {
      documentation.sortOrder = updates.sortOrder;
      changed = true;
    }

    if (updates.checklist !== undefined) {
      const nextChecklist = updates.checklist.map((item) => ({
        id: item.id,
        text: item.text,
        required: item.required,
        completed: item.completed,
      }));
      if (
        !this.areProjectDocumentationChecklistsEqual(
          documentation.checklist,
          nextChecklist,
        )
      ) {
        documentation.checklist = nextChecklist;
        changed = true;
      }
    }

    return changed;
  }

  private applyProjectRoadmapUpdates(
    roadmap: ProjectRoadmapDocument,
    updates: ProjectRoadmapUpdate,
  ) {
    let changed = false;

    if (updates.title !== undefined && updates.title !== roadmap.title) {
      roadmap.title = updates.title;
      changed = true;
    }
    if (updates.status !== undefined && updates.status !== roadmap.status) {
      roadmap.status = updates.status;
      changed = true;
    }
    if (
      updates.horizonMonths !== undefined &&
      updates.horizonMonths !== roadmap.horizonMonths
    ) {
      roadmap.horizonMonths = updates.horizonMonths;
      changed = true;
    }
    if (updates.notes !== undefined && updates.notes !== roadmap.notes) {
      roadmap.notes = updates.notes;
      changed = true;
    }

    if (updates.items !== undefined) {
      const nextItems = updates.items.map((item) => ({
        id: item.id,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
        owners: item.owners ? [...item.owners] : undefined,
        dependencies: item.dependencies ? [...item.dependencies] : undefined,
        deliveryRisk: item.deliveryRisk,
      }));
      if (!this.areProjectRoadmapItemsEqual(roadmap.items, nextItems)) {
        roadmap.items = nextItems;
        changed = true;
      }
    }

    return changed;
  }

  private toProjectDocumentationSnapshot(
    documentation: ProjectDocumentationDocument,
  ) {
    return {
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist.map((item) => ({
        id: item.id,
        text: item.text,
        required: item.required,
        completed: item.completed,
      })),
    };
  }

  private toProjectRoadmapSnapshot(roadmap: ProjectRoadmapDocument) {
    return {
      title: roadmap.title,
      status: roadmap.status,
      version: roadmap.version,
      horizonMonths: roadmap.horizonMonths,
      notes: roadmap.notes,
      items: roadmap.items.map((item) => ({
        id: item.id,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
        owners: item.owners ? [...item.owners] : [],
        dependencies: item.dependencies ? [...item.dependencies] : [],
        deliveryRisk: item.deliveryRisk,
      })),
    };
  }

  private areProjectDocumentationChecklistsEqual(
    current: ProjectDocumentationChecklistItem[],
    next: ProjectDocumentationChecklistItem[],
  ) {
    if (current.length !== next.length) {
      return false;
    }

    return current.every(
      (item, index) =>
        item.id === next[index].id &&
        item.text === next[index].text &&
        item.required === next[index].required &&
        item.completed === next[index].completed,
    );
  }

  private areProjectRoadmapItemsEqual(
    current: ProjectRoadmapItem[],
    next: ProjectRoadmapItem[],
  ) {
    if (current.length !== next.length) {
      return false;
    }

    return current.every((item, index) => {
      const nextItem = next[index];
      const owners = item.owners ?? [];
      const nextOwners = nextItem.owners ?? [];
      const dependencies = item.dependencies ?? [];
      const nextDependencies = nextItem.dependencies ?? [];

      if (owners.length !== nextOwners.length) {
        return false;
      }
      if (dependencies.length !== nextDependencies.length) {
        return false;
      }

      const ownersMatch = owners.every((owner, ownerIndex) => {
        return owner === nextOwners[ownerIndex];
      });
      const dependenciesMatch = dependencies.every(
        (dependency, dependencyIndex) => {
          return dependency === nextDependencies[dependencyIndex];
        },
      );

      return (
        item.id === nextItem.id &&
        item.title === nextItem.title &&
        item.startDate === nextItem.startDate &&
        item.endDate === nextItem.endDate &&
        item.status === nextItem.status &&
        ownersMatch &&
        dependenciesMatch &&
        item.deliveryRisk === nextItem.deliveryRisk
      );
    });
  }

  private async ensureProjectDocumentation(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ) {
    const documentation = await this.projectDocumentationModel
      .findOne({ projectId: project.id })
      .session(session ?? null);
    if (documentation) {
      return documentation;
    }

    try {
      const [document] = await this.projectDocumentationModel.create(
        [
          {
            projectId: project.id,
            parentPageId: undefined,
            slug: 'overview',
            title: 'Documentacion del proyecto',
            summary: 'Resumen base del documento operativo del proyecto.',
            bodyMarkdown:
              'Esta vista muestra el documento de operacion base del proyecto.',
            pageType: 'OVERVIEW',
            status: 'DRAFT',
            version: 1,
            sortOrder: 0,
            checklist: [
              {
                id: 'goals-defined',
                text: 'Objetivos y restricciones iniciales definidos',
                required: true,
                completed: false,
              },
              {
                id: 'roadmap-v1',
                text: 'Roadmap inicial cargado',
                required: false,
                completed: false,
              },
            ] as ProjectDocumentationChecklistItem[],
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );
      return document;
    } catch (error: unknown) {
      const existing = await this.projectDocumentationModel
        .findOne({ projectId: project.id })
        .session(session ?? null);
      if (existing) {
        return existing;
      }

      throw error;
    }
  }

  private async ensureProjectRoadmap(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ) {
    const roadmap = await this.projectRoadmapModel
      .findOne({ projectId: project.id })
      .session(session ?? null);
    if (roadmap) {
      return roadmap;
    }

    try {
      const [roadmapDocument] = await this.projectRoadmapModel.create(
        [
          {
            projectId: project.id,
            title: 'Roadmap del proyecto',
            status: 'PLANNING',
            version: 1,
            horizonMonths: 6,
            notes:
              'Plan inicial en borrador, completar hitos conforme avance la entrega.',
            items: [
              {
                id: 'kickoff',
                title: 'Kickoff operativo',
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0],
                status: 'PLANNED',
                owners: ['PM'],
                dependencies: [],
                deliveryRisk: 'Definir riesgos del despliegue.',
              },
            ],
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );
      return roadmapDocument;
    } catch (error: unknown) {
      const existing = await this.projectRoadmapModel
        .findOne({ projectId: project.id })
        .session(session ?? null);
      if (existing) {
        return existing;
      }

      throw error;
    }
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

    const access =
      await this.principalAuthorizationService.getProjectCollectionAccess(
        principal,
        {
          organizationId,
          moduleKey,
          permissionKey,
        },
      );
    const explicitProjectIds = Object.keys(
      access.projectScopedRoleIdsByProjectId,
    );
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

    const projects = await this.projectModel
      .find(query)
      .sort({ createdAt: -1 });
    return projects.filter((project) => projectMatchesAccess(project, access));
  }

  toReadModel(project: ProjectDocument): ProjectReadModel {
    return {
      id: project.id,
      organizationId: project.organizationId,
      projectKind: project.projectKind ?? 'CLIENT',
      key: project.key,
      name: project.name,
      description: project.description,
      objective: project.objective,
      ownerUserId: project.ownerUserId,
      clientId: project.clientId,
      opportunityId: project.opportunityId,
      status: project.status,
      health: project.health ?? 'ON_TRACK',
      healthReason: project.healthReason,
      healthUpdatedAt: project.healthUpdatedAt?.toISOString(),
      healthUpdatedBy: project.healthUpdatedBy,
      startDate: toIsoDate(project.startDate),
      targetDate: toIsoDate(project.targetDate),
      accessRoleIds: [...project.accessRoleIds],
      accessPolicyVersion: project.accessPolicyVersion,
      createdBy: project.createdBy,
      createdAt: project.createdAt?.toISOString(),
      updatedAt: project.updatedAt?.toISOString(),
    };
  }

  private toProjectAuditSnapshot(project: ProjectDocument) {
    return {
      key: project.key,
      name: project.name,
      description: project.description,
      objective: project.objective,
      ownerUserId: project.ownerUserId,
      startDate: toIsoDate(project.startDate),
      targetDate: toIsoDate(project.targetDate),
    };
  }
}

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseProjectDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date | undefined) {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function applyProjectDetails(
  project: ProjectDocument,
  updates: UpdateProjectDetailsInput,
) {
  let changed = false;

  if (updates.name !== undefined && updates.name.trim() !== project.name) {
    project.name = updates.name.trim();
    changed = true;
  }

  const optionalTextFields = [
    'description',
    'objective',
    'ownerUserId',
  ] as const;
  for (const field of optionalTextFields) {
    if (updates[field] === undefined) {
      continue;
    }

    const nextValue = normalizeOptionalText(updates[field]);
    if (nextValue !== project[field]) {
      project[field] = nextValue;
      changed = true;
    }
  }

  const dateFields = ['startDate', 'targetDate'] as const;
  for (const field of dateFields) {
    if (updates[field] === undefined) {
      continue;
    }

    const nextValue = parseProjectDate(updates[field]);
    if (toIsoDate(nextValue) !== toIsoDate(project[field])) {
      project[field] = nextValue;
      changed = true;
    }
  }

  return changed;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function coerceProjectReadModel(
  value: Record<string, unknown> | undefined,
): ProjectReadModel | null {
  if (!value) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.organizationId !== 'string' ||
    typeof value.projectKind !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.health !== 'string' ||
    !Array.isArray(value.accessRoleIds)
  ) {
    return null;
  }

  return value as ProjectReadModel;
}

function projectMatchesAccess(
  project: ProjectDocument,
  access: ProjectCollectionAccess,
) {
  if (
    project.accessRoleIds.some((roleId) => access.broadRoleIds.includes(roleId))
  ) {
    return true;
  }

  const scopedRoleIds =
    access.projectScopedRoleIdsByProjectId[project.id] ?? [];
  return project.accessRoleIds.some((roleId) => scopedRoleIds.includes(roleId));
}
