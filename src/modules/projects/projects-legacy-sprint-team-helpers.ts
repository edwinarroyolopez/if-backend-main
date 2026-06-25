import { ProjectsLegacyRoadmapHelpers } from './projects-legacy-roadmap-helpers';
import {
  AppException,
  ClientSession,
  ProjectDocument,
  ProjectMembershipDocument,
  ProjectSprintDocument,
  ProjectSprintItemDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectMembershipReadModel,
  ProjectSprintItemReadModel,
  ProjectSprintReadModel,
} from './projects-legacy.types';

export abstract class ProjectsLegacySprintTeamHelpers extends ProjectsLegacyRoadmapHelpers {
  protected async getSprintForProject(
    project: ProjectDocument,
    sprintId: string,
  ) {
    const sprint = await this.projectSprintModel.findOne({
      _id: sprintId,
      organizationId: project.organizationId,
      projectId: project.id,
    });
    if (!sprint) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sprint was not found',
      );
    }
    return sprint;
  }
  protected async getSprintForProjectForWrite(
    project: ProjectDocument,
    sprintId: string,
    session: ClientSession,
  ) {
    const sprint = await this.projectSprintModel
      .findOne({
        _id: sprintId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (!sprint) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sprint was not found',
      );
    }
    return sprint;
  }
  protected async toSprintReadModel(
    sprint: ProjectSprintDocument,
    session?: ClientSession,
  ): Promise<ProjectSprintReadModel> {
    const query = this.projectSprintItemModel
      .find({
        organizationId: sprint.organizationId,
        projectId: sprint.projectId,
        sprintId: sprint.id,
      })
      .sort({ boardStatus: 1, order: 1, createdAt: 1 });
    const items = session ? await query.session(session) : await query;
    return this.toSprintReadModelFromDocuments(sprint, items);
  }
  protected toSprintReadModelFromDocuments(
    sprint: ProjectSprintDocument,
    items: ProjectSprintItemDocument[],
  ): ProjectSprintReadModel {
    return {
      id: sprint.id,
      organizationId: sprint.organizationId,
      projectId: sprint.projectId,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      startedAt: sprint.startedAt?.toISOString(),
      completedAt: sprint.completedAt?.toISOString(),
      cancelledAt: sprint.cancelledAt?.toISOString(),
      active: sprint.active,
      version: sprint.version,
      createdBy: sprint.createdBy,
      updatedBy: sprint.updatedBy,
      createdAt: sprint.createdAt?.toISOString(),
      updatedAt: sprint.updatedAt?.toISOString(),
      items: items.map((item) => this.toSprintItemReadModel(item)),
    };
  }
  protected toSprintItemReadModel(
    item: ProjectSprintItemDocument,
  ): ProjectSprintItemReadModel {
    return {
      id: item.id,
      organizationId: item.organizationId,
      projectId: item.projectId,
      sprintId: item.sprintId,
      backlogItemId: item.backlogItemId,
      roadmapId: item.roadmapId,
      roadmapVersionId: item.roadmapVersionId,
      milestoneId: item.milestoneId,
      epicId: item.epicId,
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      estimate: item.estimate,
      boardStatus: item.boardStatus,
      order: item.order,
      version: item.version,
      sourceBacklogVersion: item.sourceBacklogVersion,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      createdAt: item.createdAt?.toISOString(),
      updatedAt: item.updatedAt?.toISOString(),
    };
  }
  protected toProjectMembershipReadModel(
    membership: ProjectMembershipDocument,
  ): ProjectMembershipReadModel {
    return {
      id: membership.id,
      organizationId: membership.organizationId,
      projectId: membership.projectId,
      userId: membership.userId,
      displayName: membership.displayName,
      email: membership.email,
      role: membership.role,
      capacity: membership.capacity,
      capacityUnit: 'HOURS_PER_WEEK',
      status: membership.status,
      version: membership.version,
      createdBy: membership.createdBy,
      updatedBy: membership.updatedBy,
      createdAt: membership.createdAt?.toISOString(),
      updatedAt: membership.updatedAt?.toISOString(),
      deactivatedAt: membership.deactivatedAt?.toISOString(),
    };
  }
  protected async getMembershipForProjectForWrite(
    project: ProjectDocument,
    membershipId: string,
    session: ClientSession,
  ) {
    const membership = await this.projectMembershipModel
      .findOne({
        _id: membershipId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (!membership) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Team membership was not found',
      );
    }
    return membership;
  }
  protected async assertNoActiveMembershipDuplicate(
    project: ProjectDocument,
    input: { id?: string; userId?: string; emailNormalized?: string },
    session: ClientSession,
  ) {
    const duplicateClauses = [];
    if (input.userId) duplicateClauses.push({ userId: input.userId });
    if (input.emailNormalized) {
      duplicateClauses.push({ emailNormalized: input.emailNormalized });
    }
    if (duplicateClauses.length === 0) return;
    const duplicate = await this.projectMembershipModel
      .findOne({
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'ACTIVE',
        _id: { $ne: input.id },
        $or: duplicateClauses,
      })
      .session(session);
    if (duplicate) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Active team membership already exists for this user or email',
      );
    }
  }
}
