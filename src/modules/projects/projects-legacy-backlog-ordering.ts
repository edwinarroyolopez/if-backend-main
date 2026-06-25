import { ProjectsLegacyBacklogItems } from './projects-legacy-backlog-items';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import { ProjectBacklogReorderItem } from './projects-legacy.types';
import {
  assertExpectedBacklogItemVersion,
  canonicalJson,
  coerceBacklogListResponse,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyBacklogOrdering extends ProjectsLegacyBacklogItems {
  async reorderProjectBacklogItemsForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    items: ProjectBacklogReorderItem[],
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.backlog.reorder:${project.id}:${canonicalJson(items)}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceBacklogListResponse(begun.record.responseBody);
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent backlog reorder response is not reusable',
      );
    }
    const itemIds = items.map((item) => item.id);
    const backlogItems = await this.projectBacklogItemModel
      .find({
        _id: { $in: itemIds },
        organizationId: project.organizationId,
        projectId: project.id,
        status: { $ne: 'ARCHIVED' },
      })
      .session(session);
    if (backlogItems.length !== itemIds.length) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'One or more backlog items were not found',
      );
    }
    const inputById = new Map(items.map((item) => [item.id, item] as const));
    const before = backlogItems.map((item) =>
      this.toBacklogItemReadModel(item),
    );
    for (const item of backlogItems) {
      const input = inputById.get(item.id);
      if (!input) continue;
      assertExpectedBacklogItemVersion(item, input.expectedVersion);
      if (item.order !== input.order) {
        item.order = input.order;
        item.version += 1;
        item.updatedBy = principal.sub;
        await item.save({ session });
      }
    }
    const ordered = await this.projectBacklogItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        status: { $ne: 'ARCHIVED' },
      })
      .sort({ order: 1, createdAt: 1 })
      .session(session);
    const response = {
      items: ordered.map((item) => this.toBacklogItemReadModel(item)),
    };
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.backlog.reorder',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.backlog.prioritize',
        before: { items: before },
        after: { items: response.items },
      },
      session,
    );
    await this.idempotencyService.complete(
      begun.record.id,
      200,
      response,
      session,
    );
    return response;
  }
  async archiveProjectBacklogItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    itemId: string,
    expectedVersion: number,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const item = await this.getBacklogItemForWrite(project, itemId, session);
    if (item.status === 'ARCHIVED') {
      return this.toBacklogItemReadModel(item);
    }
    assertExpectedBacklogItemVersion(item, expectedVersion);
    const before = this.toBacklogItemReadModel(item);
    item.status = 'ARCHIVED';
    item.archivedAt = new Date();
    item.version += 1;
    item.updatedBy = principal.sub;
    await item.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.backlog.archive',
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
