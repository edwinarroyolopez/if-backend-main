import { ProjectsLegacySprintTeamHelpers } from './projects-legacy-sprint-team-helpers';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  ProjectDocument,
  ProjectSprintItemBoardStatus,
  ProjectSprintStatus,
  REASON_CODES,
} from './projects-legacy.imports';
import { coerceSprintReadModel } from './projects-legacy.utils';

export abstract class ProjectsLegacySprintWorkflowHelpers extends ProjectsLegacySprintTeamHelpers {
  protected async normalizeSprintColumnOrder(
    project: ProjectDocument,
    sprintId: string,
    boardStatus: ProjectSprintItemBoardStatus,
    movedItemId: string,
    requestedOrder: number,
    actorId: string,
    session: ClientSession,
  ) {
    const items = await this.projectSprintItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId,
        boardStatus,
      })
      .sort({ order: 1, updatedAt: 1 })
      .session(session);
    const moved = items.find((item) => item.id === movedItemId);
    if (!moved) return;
    const others = items.filter((item) => item.id !== movedItemId);
    const insertAt = Math.max(0, Math.min(requestedOrder, others.length));
    others.splice(insertAt, 0, moved);
    for (let order = 0; order < others.length; order += 1) {
      const item = others[order];
      if (!item || item.order === order) continue;
      item.order = order;
      if (item.id !== movedItemId) {
        item.version += 1;
      }
      item.updatedBy = actorId;
      await item.save({ session });
    }
  }
  protected async compactSprintColumnOrder(
    project: ProjectDocument,
    sprintId: string,
    boardStatus: ProjectSprintItemBoardStatus,
    actorId: string,
    session: ClientSession,
  ) {
    const items = await this.projectSprintItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId,
        boardStatus,
      })
      .sort({ order: 1, updatedAt: 1 })
      .session(session);
    for (let order = 0; order < items.length; order += 1) {
      const item = items[order];
      if (!item || item.order === order) continue;
      item.order = order;
      item.version += 1;
      item.updatedBy = actorId;
      await item.save({ session });
    }
  }
  protected async finishProjectSprintForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    targetStatus: Extract<ProjectSprintStatus, 'COMPLETED' | 'CANCELLED'>,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const sprint = await this.getSprintForProjectForWrite(
      project,
      sprintId,
      session,
    );
    const operation = `projects.sprints.${targetStatus.toLowerCase()}:${project.id}:${sprint.id}`;
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
        'Stored idempotent sprint finish response is not reusable',
      );
    }
    if (targetStatus === 'COMPLETED' && sprint.status !== 'ACTIVE') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Only active sprints can be completed',
        { currentStatus: sprint.status },
      );
    }
    if (targetStatus === 'CANCELLED' && sprint.status === 'COMPLETED') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Completed sprints cannot be cancelled',
        { currentStatus: sprint.status },
      );
    }
    const before = await this.toSprintReadModel(sprint, session);
    sprint.status = targetStatus;
    sprint.active = false;
    if (targetStatus === 'COMPLETED') {
      sprint.completedAt = new Date();
    } else {
      sprint.cancelledAt = new Date();
      await this.releaseCancelledSprintBacklog(
        project,
        sprint.id,
        principal.sub,
        session,
      );
    }
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
        action:
          targetStatus === 'COMPLETED'
            ? 'projects.sprint.complete'
            : 'projects.sprint.cancel',
        resourceType: 'PROJECT_SPRINT',
        resourceId: sprint.id,
        permissionKey:
          targetStatus === 'COMPLETED'
            ? 'projects.sprint.complete'
            : 'projects.sprint.manage',
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
  protected async releaseCancelledSprintBacklog(
    project: ProjectDocument,
    sprintId: string,
    actorId: string,
    session: ClientSession,
  ) {
    const items = await this.projectSprintItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId,
      })
      .session(session);
    const backlogIds = items.map((item) => item.backlogItemId);
    await this.projectBacklogItemModel.updateMany(
      {
        _id: { $in: backlogIds },
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'SELECTED_FOR_SPRINT',
      },
      { $set: { status: 'READY', updatedBy: actorId }, $inc: { version: 1 } },
      { session },
    );
  }
}
