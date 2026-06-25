import { ProjectsLegacyRoadmapImports } from './projects-legacy-roadmap-imports';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';

export abstract class ProjectsLegacyRoadmapActions extends ProjectsLegacyRoadmapImports {
  async activateProjectRoadmapForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    roadmapId: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const roadmap = await this.projectRoadmapModel
      .findOne({ _id: roadmapId, projectId: project.id })
      .session(session);
    if (!roadmap?.latestVersionId) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Roadmap was not found',
      );
    }
    await this.projectRoadmapVersionModel.updateMany(
      {
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'ACTIVE',
      },
      { $set: { status: 'SUPERSEDED', updatedBy: principal.sub } },
      { session },
    );
    await this.projectRoadmapVersionModel.updateOne(
      { _id: roadmap.latestVersionId, roadmapId: roadmap.id },
      { $set: { status: 'ACTIVE', updatedBy: principal.sub } },
      { session },
    );
    roadmap.activeVersionId = roadmap.latestVersionId;
    roadmap.status = 'ACTIVE';
    roadmap.updatedBy = principal.sub;
    await roadmap.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.roadmap.activate',
        resourceType: 'PROJECT_ROADMAP',
        resourceId: roadmap.id,
        permissionKey: 'projects.roadmap.activate',
        after: { activeVersionId: roadmap.activeVersionId },
      },
      session,
    );
    return this.toVersionedRoadmapReadModel(roadmap, session);
  }
  async archiveProjectRoadmapForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    roadmapId: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const roadmap = await this.projectRoadmapModel
      .findOne({ _id: roadmapId, projectId: project.id })
      .session(session);
    if (!roadmap) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Roadmap was not found',
      );
    }
    roadmap.status = 'ARCHIVED';
    roadmap.activeVersionId = undefined;
    roadmap.updatedBy = principal.sub;
    await roadmap.save({ session });
    await this.projectRoadmapVersionModel.updateMany(
      { roadmapId: roadmap.id },
      { $set: { status: 'ARCHIVED', updatedBy: principal.sub } },
      { session },
    );
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.roadmap.archive',
        resourceType: 'PROJECT_ROADMAP',
        resourceId: roadmap.id,
        permissionKey: 'projects.roadmap.archive',
        after: { status: roadmap.status },
      },
      session,
    );
    return this.toVersionedRoadmapReadModel(roadmap, session);
  }
}
