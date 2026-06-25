import { ProjectsLegacyAuditReadModels } from './projects-legacy-audit-read-models';
import {
  AppException,
  ClientSession,
  ProjectDocument,
  REASON_CODES,
  normalizeProjectKind,
} from './projects-legacy.imports';
import { CreateProjectInput, ProjectReadModel } from './projects-legacy.types';
import {
  coerceProjectReadModel,
  isDuplicateKeyError,
  normalizeOptionalText,
  parseProjectDate,
  resolveProjectKey,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyProjectCommands extends ProjectsLegacyAuditReadModels {
  async createProjectForRequest(
    input: CreateProjectInput,
    idempotencyKey: string,
    session: ClientSession,
  ): Promise<ProjectReadModel> {
    const normalizedKey = resolveProjectKey(input);
    const operation = `projects.project.create:${normalizedKey}`;
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
    const normalizedKey = resolveProjectKey(input);
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
            key: normalizedKey,
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
          { field: 'key', suggestedKey: `${normalizedKey}-2` },
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
}
