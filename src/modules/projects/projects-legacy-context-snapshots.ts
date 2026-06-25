import { ProjectsLegacyDocumentImports } from './projects-legacy-document-imports';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  buildContextSnapshotPlan,
  coerceContextSnapshotReadModel,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyContextSnapshots extends ProjectsLegacyDocumentImports {
  async listProjectContextSnapshots(projectId: string) {
    const project = await this.getExistingProject(projectId);
    const snapshots = await this.projectContextSnapshotModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ createdAt: -1 });
    return snapshots.map((snapshot) =>
      this.toContextSnapshotReadModel(snapshot),
    );
  }
  async getProjectContextSnapshot(projectId: string, snapshotId: string) {
    const project = await this.getExistingProject(projectId);
    const snapshot = await this.projectContextSnapshotModel.findOne({
      _id: snapshotId,
      organizationId: project.organizationId,
      projectId: project.id,
    });
    if (!snapshot) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Context snapshot was not found',
      );
    }
    return this.toContextSnapshotReadModel(snapshot);
  }
  async createProjectContextSnapshotForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const approvedPages = await this.projectDocumentPageModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'APPROVED',
      })
      .sort({ sortOrder: 1, slug: 1, createdAt: 1 })
      .session(session);
    if (approvedPages.length === 0) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'At least one approved document page is required to create a context snapshot',
        { requiredStatus: 'APPROVED' },
      );
    }
    const approvedVersions = await this.projectDocumentPageVersionModel
      .find({
        organizationId: project.organizationId,
        projectId: project.id,
        $or: approvedPages.map((page) => ({
          pageId: page.id,
          pageVersion: page.version,
        })),
      })
      .session(session);
    const versionByPageId = new Map(
      approvedVersions.map((version) => [version.pageId, version] as const),
    );
    for (const page of approvedPages) {
      if (!versionByPageId.has(page.id)) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Approved document page version is missing and cannot be snapshotted',
          { pageId: page.id, pageVersion: page.version },
        );
      }
    }
    const snapshotPlan = buildContextSnapshotPlan(
      project,
      approvedPages.map((page) => versionByPageId.get(page.id)!),
    );
    const operation = `projects.context_snapshots.create:${project.id}:${snapshotPlan.approvedDocumentationHash}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceContextSnapshotReadModel(
        begun.record.responseBody,
      );
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent context snapshot response is not reusable',
      );
    }
    const existingSnapshot = await this.projectContextSnapshotModel
      .findOne({
        organizationId: project.organizationId,
        projectId: project.id,
        snapshotKey: snapshotPlan.snapshotKey,
      })
      .session(session);
    if (existingSnapshot) {
      const response = this.toContextSnapshotReadModel(existingSnapshot);
      await this.idempotencyService.complete(
        begun.record.id,
        200,
        { ...response },
        session,
      );
      return response;
    }
    const [snapshot] = await this.projectContextSnapshotModel.create(
      [
        {
          organizationId: project.organizationId,
          projectId: project.id,
          snapshotKey: snapshotPlan.snapshotKey,
          title: snapshotPlan.title,
          sourcePageIds: snapshotPlan.sourcePageIds,
          sourcePageVersions: snapshotPlan.sourcePageVersions,
          approvedDocumentationHash: snapshotPlan.approvedDocumentationHash,
          contentSummary: snapshotPlan.contentSummary,
          facts: snapshotPlan.facts,
          assumptions: snapshotPlan.assumptions,
          decisions: snapshotPlan.decisions,
          risks: snapshotPlan.risks,
          openQuestions: snapshotPlan.openQuestions,
          constraints: snapshotPlan.constraints,
          createdBy: principal.sub,
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
        action: 'projects.context_snapshot.create',
        resourceType: 'PROJECT_CONTEXT_SNAPSHOT',
        resourceId: snapshot.id,
        permissionKey: 'projects.snapshot.create',
        after: {
          projectId: project.id,
          snapshotKey: snapshot.snapshotKey,
          approvedDocumentationHash: snapshot.approvedDocumentationHash,
          sourcePageIds: [...snapshot.sourcePageIds],
          sourcePageVersions: { ...snapshot.sourcePageVersions },
        },
      },
      session,
    );
    const response = this.toContextSnapshotReadModel(snapshot);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      { ...response },
      session,
    );
    return response;
  }
}
