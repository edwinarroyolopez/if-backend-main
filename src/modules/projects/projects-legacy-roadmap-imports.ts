import { ProjectsLegacyRoadmapQueries } from './projects-legacy-roadmap-queries';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import { ProjectRoadmapReadModel } from './projects-legacy.types';

export abstract class ProjectsLegacyRoadmapImports extends ProjectsLegacyRoadmapQueries {
  async commitProjectRoadmapImportForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    roadmapImport: unknown,
    previewToken: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const preview = await this.buildRoadmapImportPreview(
      project,
      roadmapImport,
      session,
    );
    if (preview.errors.length > 0 || preview.previewToken !== previewToken) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Roadmap import preview token is not valid for this payload',
        { errors: preview.errors },
      );
    }
    const existingImport = await this.projectRoadmapImportModel
      .findOne({
        organizationId: project.organizationId,
        projectId: project.id,
        previewToken,
      })
      .session(session);
    if (existingImport) {
      const existingRoadmap = await this.projectRoadmapModel
        .findOne({
          _id: existingImport.roadmapId,
          organizationId: project.organizationId,
          projectId: project.id,
        })
        .session(session);
      if (existingRoadmap) {
        return this.toVersionedRoadmapReadModel(existingRoadmap, session);
      }
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Committed roadmap import points to a missing roadmap',
        { previewToken },
      );
    }
    const operation = `projects.roadmap_imports.commit:${project.id}:${previewToken}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = begun.record.responseBody as
        | ProjectRoadmapReadModel
        | undefined;
      if (response?.id) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent roadmap import response is not reusable',
      );
    }
    let roadmap = await this.projectRoadmapModel
      .findOne({ projectId: project.id })
      .session(session);
    if (!roadmap) {
      [roadmap] = await this.projectRoadmapModel.create(
        [
          {
            organizationId: project.organizationId,
            projectId: project.id,
            title: preview.normalized.roadmap.title,
            status: 'PLANNING',
            version: 1,
            items: [],
            createdBy: principal.sub,
            updatedBy: principal.sub,
          },
        ],
        { session },
      );
    }
    const nextVersionNumber =
      (await this.projectRoadmapVersionModel
        .countDocuments({
          organizationId: project.organizationId,
          projectId: project.id,
          roadmapId: roadmap.id,
        })
        .session(session)) + 1;
    const [version] = await this.projectRoadmapVersionModel.create(
      [
        {
          organizationId: project.organizationId,
          projectId: project.id,
          roadmapId: roadmap.id,
          snapshotId: preview.snapshot.id,
          snapshotKey: preview.snapshot.snapshotKey,
          snapshotHash: preview.snapshot.approvedDocumentationHash,
          title: preview.normalized.roadmap.title,
          versionLabel: preview.normalized.roadmap.versionLabel,
          versionNumber: nextVersionNumber,
          startDate: preview.normalized.roadmap.startDate,
          endDate: preview.normalized.roadmap.endDate,
          status: 'DRAFT',
          planningAssumptions: preview.normalized.roadmap.planningAssumptions,
          constraints: preview.normalized.roadmap.constraints,
          horizons: preview.normalized.horizons,
          backlogCandidates: preview.normalized.backlogCandidates,
          createdBy: principal.sub,
          updatedBy: principal.sub,
        },
      ],
      { session },
    );
    await this.projectRoadmapMilestoneModel.create(
      preview.normalized.milestones.map((milestone) => ({
        organizationId: project.organizationId,
        projectId: project.id,
        roadmapId: roadmap.id,
        roadmapVersionId: version.id,
        ...milestone,
      })),
      { ordered: true, session },
    );
    await this.projectRoadmapEpicModel.create(
      preview.normalized.epics.map((epic) => ({
        organizationId: project.organizationId,
        projectId: project.id,
        roadmapId: roadmap.id,
        roadmapVersionId: version.id,
        ...epic,
      })),
      { ordered: true, session },
    );
    await this.projectRoadmapImportModel.create(
      [
        {
          organizationId: project.organizationId,
          projectId: project.id,
          snapshotId: preview.snapshot.id,
          previewToken,
          importHash: preview.importHash,
          status: 'COMMITTED',
          roadmapId: roadmap.id,
          roadmapVersionId: version.id,
          createdBy: principal.sub,
        },
      ],
      { session },
    );
    roadmap.title = preview.normalized.roadmap.title;
    roadmap.latestVersionId = version.id;
    roadmap.updatedBy = principal.sub;
    await roadmap.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.roadmap.import_commit',
        resourceType: 'PROJECT_ROADMAP',
        resourceId: roadmap.id,
        permissionKey: 'projects.roadmap.import',
        after: {
          roadmapVersionId: version.id,
          snapshotId: preview.snapshot.id,
        },
      },
      session,
    );
    const response = await this.toVersionedRoadmapReadModel(roadmap, session);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      { ...response },
      session,
    );
    return response;
  }
}
