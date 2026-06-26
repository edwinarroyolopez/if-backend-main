import { ProjectsLegacySprintPlanning } from './projects-legacy-sprint-planning';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  PROJECT_SPRINT_ITEM_BOARD_STATUSES,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectSprintBoardMoveInput,
  ProjectSprintRemoveItemInput,
} from './projects-legacy.types';
import {
  assertExpectedSprintItemVersion,
  coerceSprintReadModel,
} from './projects-legacy.utils';

export abstract class ProjectsLegacySprintBoardActions extends ProjectsLegacySprintPlanning {
  async moveProjectSprintItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    input: ProjectSprintBoardMoveInput,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const sprint = await this.getSprintForProjectForWrite(
      project,
      sprintId,
      session,
    );
    if (sprint.status !== 'ACTIVE') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Board moves are only allowed on active sprints',
        { currentStatus: sprint.status },
      );
    }
    if (!PROJECT_SPRINT_ITEM_BOARD_STATUSES.includes(input.toStatus)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Board status is not supported',
        { field: 'toStatus' },
      );
    }
    const sprintItem = await this.projectSprintItemModel
      .findOne({
        _id: input.itemId,
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId: sprint.id,
      })
      .session(session);
    if (!sprintItem) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sprint item was not found',
      );
    }
    assertExpectedSprintItemVersion(sprintItem, input.expectedVersion);
    const before = this.toSprintItemReadModel(sprintItem);
    sprintItem.boardStatus = input.toStatus;
    sprintItem.order = input.order;
    sprintItem.version += 1;
    sprintItem.updatedBy = principal.sub;
    await sprintItem.save({ session });
    await this.normalizeSprintColumnOrder(
      project,
      sprint.id,
      input.toStatus,
      sprintItem.id,
      input.order,
      principal.sub,
      session,
    );
    const movedItem = await this.projectSprintItemModel
      .findById(sprintItem.id)
      .session(session);
    if (!movedItem) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sprint item was not found after move',
      );
    }
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.sprint.board_move',
        resourceType: 'PROJECT_SPRINT_ITEM',
        resourceId: sprintItem.id,
        permissionKey: 'projects.sprint.manage',
        before,
        after: this.toSprintItemReadModel(movedItem),
      },
      session,
    );
    return this.toSprintReadModel(sprint, session);
  }

  async removeProjectSprintItemForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    input: ProjectSprintRemoveItemInput,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const sprint = await this.getSprintForProjectForWrite(
      project,
      sprintId,
      session,
    );
    if (sprint.status !== 'PLANNING') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Sprint items can only be removed while sprint is planning',
        { currentStatus: sprint.status },
      );
    }

    const operation = `projects.sprints.remove_item:${project.id}:${sprint.id}:${input.itemId}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceSprintReadModel(begun.record.responseBody);
      if (response) return response;
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent sprint remove-item response is not reusable',
      );
    }

    const sprintItem = await this.projectSprintItemModel
      .findOne({
        _id: input.itemId,
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId: sprint.id,
      })
      .session(session);
    if (!sprintItem) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sprint item was not found',
      );
    }
    assertExpectedSprintItemVersion(sprintItem, input.expectedVersion);
    const before = this.toSprintItemReadModel(sprintItem);

    await this.projectSprintItemModel.deleteOne(
      { _id: sprintItem.id },
      { session },
    );
    await this.projectBacklogItemModel.updateOne(
      {
        _id: sprintItem.backlogItemId,
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'SELECTED_FOR_SPRINT',
      },
      {
        $set: { status: 'READY', updatedBy: principal.sub },
        $inc: { version: 1 },
      },
      { session },
    );
    await this.compactSprintColumnOrder(
      project,
      sprint.id,
      sprintItem.boardStatus,
      principal.sub,
      session,
    );
    sprint.version += 1;
    sprint.updatedBy = principal.sub;
    await sprint.save({ session });
    const response = await this.toSprintReadModel(sprint, session);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.sprint.remove_item',
        resourceType: 'PROJECT_SPRINT_ITEM',
        resourceId: sprintItem.id,
        permissionKey: 'projects.sprint.manage',
        before,
        after: { sprint: response, backlogItemId: sprintItem.backlogItemId },
        metadata: { projectId: project.id, sprintId: sprint.id },
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
}
