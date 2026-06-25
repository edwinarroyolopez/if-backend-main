import { ProjectsLegacyBacklogImports } from './projects-legacy-backlog-imports';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectBacklogItemInput,
  ProjectBacklogItemUpdate,
} from './projects-legacy.types';
import {
  applyBacklogItemUpdates,
  assertExpectedBacklogItemVersion,
  coerceBacklogItemReadModel,
  normalizeBacklogItemInput,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyBacklogItems extends ProjectsLegacyBacklogImports {
  async createProjectBacklogItemForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ProjectBacklogItemInput,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.backlog.create:${project.id}:${input.title}:${input.roadmapVersionId}:${input.epicKey}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceBacklogItemReadModel(begun.record.responseBody);
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent backlog item response is not reusable',
      );
    }
    const normalized = normalizeBacklogItemInput(input);
    const nextOrder =
      input.order ??
      (await this.projectBacklogItemModel
        .countDocuments({
          organizationId: project.organizationId,
          projectId: project.id,
          status: { $ne: 'ARCHIVED' },
        })
        .session(session));
    const [item] = await this.projectBacklogItemModel.create(
      [
        {
          ...normalized,
          organizationId: project.organizationId,
          projectId: project.id,
          order: nextOrder,
          version: 1,
          createdBy: principal.sub,
          updatedBy: principal.sub,
        },
      ],
      { session },
    );
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.backlog.create',
        resourceType: 'PROJECT_BACKLOG_ITEM',
        resourceId: item.id,
        permissionKey: 'projects.backlog.create',
        after: this.toBacklogItemReadModel(item),
      },
      session,
    );
    const response = this.toBacklogItemReadModel(item);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      response,
      session,
    );
    return response;
  }
  async updateProjectBacklogItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    itemId: string,
    updates: ProjectBacklogItemUpdate,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const item = await this.getBacklogItemForWrite(project, itemId, session);
    assertExpectedBacklogItemVersion(item, updates.expectedVersion);
    if (updates.status === 'SELECTED_FOR_SPRINT') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'SELECTED_FOR_SPRINT is reserved for Scrum in Loop 8',
        { field: 'status' },
      );
    }
    const before = this.toBacklogItemReadModel(item);
    const changed = applyBacklogItemUpdates(item, updates);
    if (!changed) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No backlog item updates were provided',
      );
    }
    item.version += 1;
    item.updatedBy = principal.sub;
    await item.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.backlog.update',
        resourceType: 'PROJECT_BACKLOG_ITEM',
        resourceId: item.id,
        permissionKey: 'projects.backlog.update',
        before,
        after: this.toBacklogItemReadModel(item),
      },
      session,
    );
    return this.toBacklogItemReadModel(item);
  }
}
