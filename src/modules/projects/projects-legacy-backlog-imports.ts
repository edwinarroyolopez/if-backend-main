import { ProjectsLegacyRoadmapActions } from './projects-legacy-roadmap-actions';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import { ProjectBacklogItemReadModel } from './projects-legacy.types';
import { coerceBacklogImportCommitResponse } from './projects-legacy.utils';

export abstract class ProjectsLegacyBacklogImports extends ProjectsLegacyRoadmapActions {
  async listProjectBacklogItems(projectId: string, includeArchived = false) {
    const project = await this.getExistingProject(projectId);
    const items = await this.projectBacklogItemModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        ...(includeArchived ? {} : { status: { $ne: 'ARCHIVED' } }),
      })
      .sort({ order: 1, createdAt: 1 });
    const activeRoadmap = await this.projectRoadmapModel.findOne({
      organizationId: project.organizationId,
      projectId: project.id,
      status: 'ACTIVE',
      activeVersionId: { $exists: true },
    });
    return {
      activeRoadmap: activeRoadmap
        ? await this.toVersionedRoadmapReadModel(activeRoadmap)
        : undefined,
      items: items.map((item) => this.toBacklogItemReadModel(item)),
    };
  }
  async previewBacklogImportFromRoadmap(projectId: string) {
    const project = await this.getExistingProject(projectId);
    const preview = await this.buildBacklogImportPreview(project);
    if (preview.errors.length > 0) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Backlog import cannot be previewed for this project',
        { errors: preview.errors },
      );
    }
    return preview;
  }
  async commitBacklogImportFromRoadmapForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    previewToken: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const preview = await this.buildBacklogImportPreview(project, session);
    if (preview.errors.length > 0 || preview.previewToken !== previewToken) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Backlog import preview token is not valid for the active roadmap',
        { errors: preview.errors },
      );
    }
    const operation = `projects.backlog.import:${project.id}:${preview.roadmapVersionId}:${previewToken}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceBacklogImportCommitResponse(
        begun.record.responseBody,
      );
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent backlog import response is not reusable',
      );
    }
    const created: ProjectBacklogItemReadModel[] = [];
    const skipped: ProjectBacklogItemReadModel[] = [];
    let nextOrder = await this.projectBacklogItemModel
      .countDocuments({
        organizationId: project.organizationId,
        projectId: project.id,
        status: { $ne: 'ARCHIVED' },
      })
      .session(session);
    for (const candidate of preview.candidates) {
      const existing = await this.projectBacklogItemModel
        .findOne({
          organizationId: project.organizationId,
          projectId: project.id,
          roadmapVersionId: candidate.roadmapVersionId,
          sourceCandidateKey: candidate.sourceCandidateKey,
        })
        .session(session);
      if (existing) {
        skipped.push(this.toBacklogItemReadModel(existing));
        continue;
      }
      const [item] = await this.projectBacklogItemModel.create(
        [
          {
            ...candidate,
            organizationId: project.organizationId,
            projectId: project.id,
            status: 'UNREFINED',
            order: nextOrder,
            version: 1,
            createdBy: principal.sub,
            updatedBy: principal.sub,
          },
        ],
        { session },
      );
      nextOrder += 1;
      created.push(this.toBacklogItemReadModel(item));
    }
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.backlog.import_commit',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.backlog.create',
        after: {
          roadmapId: preview.roadmapId,
          roadmapVersionId: preview.roadmapVersionId,
          created: created.length,
          skipped: skipped.length,
        },
      },
      session,
    );
    const response = {
      committed: true,
      created,
      skipped,
      items: [...created, ...skipped].sort(
        (left, right) => left.order - right.order,
      ),
      summary: { created: created.length, skipped: skipped.length },
    };
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      response,
      session,
    );
    return response;
  }
}
