import { ProjectsLegacyActivityTeam } from './projects-legacy-activity-team';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectSprintAddItemsInput,
  ProjectSprintInput,
} from './projects-legacy.types';
import {
  canonicalJson,
  coerceSprintReadModel,
  uniqueStrings,
} from './projects-legacy.utils';

export abstract class ProjectsLegacySprintPlanning extends ProjectsLegacyActivityTeam {
  async createProjectSprintForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ProjectSprintInput,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.sprints.create:${project.id}:${input.name.trim()}`;
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
        'Stored idempotent sprint response is not reusable',
      );
    }
    const [sprint] = await this.projectSprintModel.create(
      [
        {
          organizationId: project.organizationId,
          projectId: project.id,
          name: input.name.trim(),
          goal: input.goal?.trim() ?? '',
          status: 'PLANNING',
          startDate: input.startDate,
          endDate: input.endDate,
          active: false,
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
        action: 'projects.sprint.create',
        resourceType: 'PROJECT_SPRINT',
        resourceId: sprint.id,
        permissionKey: 'projects.sprint.create',
        after: this.toSprintReadModelFromDocuments(sprint, []),
      },
      session,
    );
    const response = this.toSprintReadModelFromDocuments(sprint, []);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      response,
      session,
    );
    return response;
  }
  async addProjectSprintItemsForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    sprintId: string,
    input: ProjectSprintAddItemsInput,
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
        'Backlog items can only be added to a planning sprint',
        { currentStatus: sprint.status },
      );
    }
    const uniqueIds = uniqueStrings(input.backlogItemIds);
    const operation = `projects.sprints.add_items:${project.id}:${sprint.id}:${canonicalJson(uniqueIds)}`;
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
        'Stored idempotent sprint add-items response is not reusable',
      );
    }
    const existingSprintItems = await this.projectSprintItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId: sprint.id,
        backlogItemId: { $in: uniqueIds },
      })
      .session(session);
    const existingBacklogIds = new Set(
      existingSprintItems.map((item) => item.backlogItemId),
    );
    const idsToAdd = uniqueIds.filter((id) => !existingBacklogIds.has(id));
    const backlogItems = await this.projectBacklogItemModel
      .find({
        _id: { $in: idsToAdd },
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (backlogItems.length !== idsToAdd.length) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'One or more backlog items were not found for this project',
      );
    }
    for (const backlogItem of backlogItems) {
      if (backlogItem.status !== 'READY') {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Only READY backlog items can be selected for sprint',
          { backlogItemId: backlogItem.id, currentStatus: backlogItem.status },
        );
      }
    }
    let nextOrder = await this.projectSprintItemModel
      .countDocuments({
        organizationId: project.organizationId,
        projectId: project.id,
        sprintId: sprint.id,
        boardStatus: 'TO_DO',
      })
      .session(session);
    for (const backlogItem of backlogItems) {
      await this.projectSprintItemModel.create(
        [
          {
            organizationId: project.organizationId,
            projectId: project.id,
            sprintId: sprint.id,
            backlogItemId: backlogItem.id,
            roadmapId: backlogItem.roadmapId,
            roadmapVersionId: backlogItem.roadmapVersionId,
            milestoneId: backlogItem.milestoneId,
            epicId: backlogItem.epicId,
            title: backlogItem.title,
            description: backlogItem.description,
            type: backlogItem.type,
            priority: backlogItem.priority,
            estimate: backlogItem.estimate,
            boardStatus: 'TO_DO',
            order: nextOrder,
            version: 1,
            sourceBacklogVersion: backlogItem.version,
            createdBy: principal.sub,
            updatedBy: principal.sub,
          },
        ],
        { session },
      );
      nextOrder += 1;
      backlogItem.status = 'SELECTED_FOR_SPRINT';
      backlogItem.version += 1;
      backlogItem.updatedBy = principal.sub;
      await backlogItem.save({ session });
    }
    sprint.version += backlogItems.length > 0 ? 1 : 0;
    sprint.updatedBy = principal.sub;
    await sprint.save({ session });
    const response = await this.toSprintReadModel(sprint, session);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.sprint.add_items',
        resourceType: 'PROJECT_SPRINT',
        resourceId: sprint.id,
        permissionKey: 'projects.sprint.manage',
        after: { added: backlogItems.length, sprint: response },
        metadata: { projectId: project.id },
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
