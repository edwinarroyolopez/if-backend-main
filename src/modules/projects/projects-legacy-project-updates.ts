import { ProjectsLegacyProjectCommands } from './projects-legacy-project-commands';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  ProjectHealth,
  ProjectStatus,
  REASON_CODES,
  canTransitionProject,
} from './projects-legacy.imports';
import {
  ProjectDocumentationUpdate,
  UpdateProjectDetailsInput,
} from './projects-legacy.types';
import {
  applyProjectDetails,
  normalizeOptionalText,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyProjectUpdates extends ProjectsLegacyProjectCommands {
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
}
