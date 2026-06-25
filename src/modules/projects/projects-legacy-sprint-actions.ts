import { ProjectsLegacySprintPlanning } from './projects-legacy-sprint-planning';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  PROJECT_SPRINT_ITEM_BOARD_STATUSES,
  REASON_CODES,
} from './projects-legacy.imports';
import { ProjectSprintBoardMoveInput } from './projects-legacy.types';
import {
  assertExpectedSprintItemVersion,
  coerceSprintReadModel,
} from './projects-legacy.utils';

export abstract class ProjectsLegacySprintActions extends ProjectsLegacySprintPlanning {
  async startProjectSprintForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const sprint = await this.getSprintForProjectForWrite(
      project,
      sprintId,
      session,
    );
    const operation = `projects.sprints.start:${project.id}:${sprint.id}`;
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
        'Stored idempotent sprint start response is not reusable',
      );
    }
    if (sprint.status !== 'PLANNING') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Only planning sprints can be started',
        { currentStatus: sprint.status },
      );
    }
    const itemCount = await this.projectSprintItemModel
      .countDocuments({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId: sprint.id,
      })
      .session(session);
    if (itemCount === 0) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Sprint must have at least one item before start',
      );
    }
    const activeSprint = await this.projectSprintModel
      .findOne({
        organizationId: project.organizationId,
        projectId: project.id,
        active: true,
        _id: { $ne: sprint.id },
      })
      .session(session);
    if (activeSprint) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project already has an active sprint',
        { activeSprintId: activeSprint.id },
      );
    }
    const before = this.toSprintReadModelFromDocuments(sprint, []);
    sprint.status = 'ACTIVE';
    sprint.active = true;
    sprint.startedAt = new Date();
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
        action: 'projects.sprint.start',
        resourceType: 'PROJECT_SPRINT',
        resourceId: sprint.id,
        permissionKey: 'projects.sprint.manage',
        before,
        after: response,
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
  async completeProjectSprintForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    return this.finishProjectSprintForRequest(
      principal,
      projectId,
      sprintId,
      'COMPLETED',
      idempotencyKey,
      session,
    );
  }
  async cancelProjectSprintForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    return this.finishProjectSprintForRequest(
      principal,
      projectId,
      sprintId,
      'CANCELLED',
      idempotencyKey,
      session,
    );
  }
}
