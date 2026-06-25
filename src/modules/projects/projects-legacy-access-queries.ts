import { ProjectsLegacyDocumentPages } from './projects-legacy-document-pages';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  ProjectKind,
  ProjectReadiness,
  REASON_CODES,
  buildProjectReadiness,
} from './projects-legacy.imports';
import { ProjectRoadmapUpdate } from './projects-legacy.types';
import { isUsefulDocumentPage } from './projects-legacy.utils';

export abstract class ProjectsLegacyAccessQueries extends ProjectsLegacyDocumentPages {
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
    const documentPages = await this.projectDocumentPageModel.find({
      organizationId: project.organizationId,
      projectId: project.id,
      status: { $ne: 'ARCHIVED' },
    });
    const roadmap = await this.projectRoadmapModel.findOne({
      projectId: project.id,
    });
    const readyBacklogCount = await this.projectBacklogItemModel.countDocuments(
      {
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'READY',
      },
    );
    const sprintItemCount = await this.projectSprintItemModel.countDocuments({
      organizationId: project.organizationId,
      projectId: project.id,
    });
    const contextSnapshotCount =
      await this.projectContextSnapshotModel.countDocuments({
        organizationId: project.organizationId,
        projectId: project.id,
      });
    const scrumSprintCount = await this.projectSprintModel.countDocuments({
      organizationId: project.organizationId,
      projectId: project.id,
      status: { $ne: 'CANCELLED' },
    });
    const activeTeamCount = await this.projectMembershipModel.countDocuments({
      organizationId: project.organizationId,
      projectId: project.id,
      status: 'ACTIVE',
      capacity: { $gte: 1, $lte: 80 },
    });
    const usefulDocumentPages = documentPages.filter((page) =>
      isUsefulDocumentPage(page),
    );
    return buildProjectReadiness({
      hasUsefulDocumentation: usefulDocumentPages.length > 0,
      requiredDocumentationApproved: usefulDocumentPages.some(
        (page) => page.status === 'APPROVED',
      ),
      hasActiveRoadmap: roadmap?.status === 'ACTIVE',
      hasContextSnapshot: contextSnapshotCount > 0,
      hasReadyBacklog: readyBacklogCount > 0 || sprintItemCount > 0,
      hasScrumReady: scrumSprintCount > 0,
      hasMinimumTeam: activeTeamCount > 0,
    });
  }
  protected async resolveAccessRoleIds(
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
  protected async resolveProjectClientId(
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
  protected async getProjectForWrite(
    projectId: string,
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
}
