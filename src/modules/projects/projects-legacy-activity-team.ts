import { ProjectsLegacyTeamActions } from './projects-legacy-team-actions';
import {
  ProjectActivityEventReadModel,
  ProjectActivityQuery,
  ProjectActivityReadModel,
} from './projects-legacy.types';
import {
  PROJECT_ACTIVITY_ACTIONS,
  clampActivityLimit,
  mapAuditToProjectActivity,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyActivityTeam extends ProjectsLegacyTeamActions {
  async listProjectSprints(projectId: string) {
    const project = await this.getExistingProject(projectId);
    const sprints = await this.projectSprintModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ createdAt: -1 });
    return {
      items: await Promise.all(
        sprints.map((sprint) => this.toSprintReadModel(sprint)),
      ),
    };
  }
  async getProjectSprint(projectId: string, sprintId: string) {
    const project = await this.getExistingProject(projectId);
    const sprint = await this.getSprintForProject(project, sprintId);
    return this.toSprintReadModel(sprint);
  }
  async listProjectActivity(
    projectId: string,
    query: ProjectActivityQuery,
  ): Promise<ProjectActivityReadModel> {
    const project = await this.getExistingProject(projectId);
    const limit = clampActivityLimit(query.limit);
    const filters: Record<string, unknown> = {
      organizationId: project.organizationId,
      action: { $in: PROJECT_ACTIVITY_ACTIONS },
    };
    if (query.from || query.to) {
      filters.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    if (query.cursor) {
      const cursorAudit = await this.auditService.findOne({
        _id: query.cursor,
        organizationId: project.organizationId,
      });
      if (cursorAudit) {
        const cursorFilter = {
          $or: [
            { createdAt: { $lt: cursorAudit.createdAt } },
            { createdAt: cursorAudit.createdAt, _id: { $lt: cursorAudit._id } },
          ],
        };
        Object.assign(filters, cursorFilter);
      }
    }
    const projectRoadmaps = await this.projectRoadmapModel.find({
      organizationId: project.organizationId,
      projectId: project.id,
    });
    const projectRoadmapIds = new Set(
      projectRoadmaps.map((roadmap) => roadmap.id),
    );
    const audits = await this.auditService.findMany(
      filters,
      Math.min(limit * 10, 250),
    );
    const events = audits
      .map((audit) =>
        mapAuditToProjectActivity(project.id, audit, projectRoadmapIds),
      )
      .filter((event): event is ProjectActivityEventReadModel => Boolean(event))
      .filter((event) => !query.type || event.type === query.type)
      .filter(
        (event) =>
          !query.resourceKind || event.resource.kind === query.resourceKind,
      );
    const page = events.slice(0, limit);
    return {
      items: page,
      nextCursor: events.length > limit ? page[page.length - 1]?.id : undefined,
    };
  }
}
