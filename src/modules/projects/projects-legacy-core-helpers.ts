import { ProjectsLegacyBase } from './projects-legacy-base';
import {
  AppException,
  ClientSession,
  ProjectDocument,
  ProjectDocumentationDocument,
  ProjectKind,
  ProjectRoadmapDocument,
  REASON_CODES,
  createHash,
} from './projects-legacy.imports';
import {
  canonicalJson,
  validateRoadmapImportShape,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyCoreHelpers extends ProjectsLegacyBase {
  protected abstract ensureProjectDocumentation(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ): Promise<ProjectDocumentationDocument>;

  protected abstract ensureProjectRoadmap(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ): Promise<ProjectRoadmapDocument>;

  protected getDocumentImportPreviewTokenSecret() {
    return (
      this.configService.get<string>('app.documentImportPreviewTokenSecret') ??
      'inflight-project-document-import-preview-v1'
    );
  }
  protected async resolveAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[] | undefined,
    session: ClientSession,
  ) {
    if (!requestedRoleIds || requestedRoleIds.length === 0) {
      const readableRoleIds =
        await this.accessControlService.listProjectReadableRoleIds(
          organizationId,
          session,
        );
      if (readableRoleIds.length === 0) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'At least one active project-readable role is required',
        );
      }
      return readableRoleIds;
    }
    return this.accessControlService.resolveProjectAccessRoleIds(
      organizationId,
      requestedRoleIds,
      session,
    );
  }
  protected async resolveProjectClientId(
    projectKind: ProjectKind,
    clientId: string | undefined,
    organizationId: string,
  ) {
    if (!clientId) {
      if (projectKind === 'CLIENT') {
        throw new AppException(
          400,
          REASON_CODES.VALIDATION_FAILED,
          'clientId is required for CLIENT projects',
          { field: 'clientId' },
        );
      }
      return undefined;
    }
    const client = await this.crmService.findActiveByIdForOrganization(
      clientId,
      organizationId,
    );
    if (!client) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Client was not found',
        { field: 'clientId' },
      );
    }
    return clientId;
  }
  protected async getProjectForWrite(
    projectId: string,
    session: ClientSession,
  ) {
    const project = await this.projectModel
      .findById(projectId)
      .session(session);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return project;
  }
  async getProjectDocumentation(projectId: string, actorId: string) {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return this.ensureProjectDocumentation(project, actorId);
  }
  async getProjectRoadmap(projectId: string, actorId: string) {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return this.ensureProjectRoadmap(project, actorId);
  }
  protected async getContextSnapshotDocument(
    project: ProjectDocument,
    snapshotId: string,
    session?: ClientSession,
  ) {
    const snapshot = await this.projectContextSnapshotModel
      .findOne({
        _id: snapshotId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session ?? null);
    if (!snapshot) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Context snapshot was not found',
      );
    }
    return snapshot;
  }
  protected async buildRoadmapImportPreview(
    project: ProjectDocument,
    roadmapImport: unknown,
    session?: ClientSession,
  ) {
    const validation = validateRoadmapImportShape(roadmapImport);
    if (!validation.normalized) {
      return {
        valid: false,
        errors: validation.errors,
        warnings: [],
        previewToken: '',
        importHash: '',
        snapshot: undefined as never,
        normalized: undefined as never,
        summary: { milestones: 0, epics: 0, backlogCandidates: 0 },
      };
    }
    const snapshot = await this.projectContextSnapshotModel
      .findOne({
        _id: validation.normalized.snapshotReference.snapshotId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session ?? null);
    const errors = [...validation.errors];
    if (!snapshot) {
      errors.push({
        path: '$.snapshotReference.snapshotId',
        message: 'Snapshot does not exist for this project.',
      });
      return {
        valid: false,
        errors,
        warnings: [],
        previewToken: '',
        importHash: '',
        snapshot: undefined as never,
        normalized: validation.normalized,
        summary: {
          milestones: validation.normalized.milestones.length,
          epics: validation.normalized.epics.length,
          backlogCandidates: validation.normalized.backlogCandidates.length,
        },
      };
    }
    if (
      validation.normalized.snapshotReference.snapshotKey !==
      snapshot.snapshotKey
    ) {
      errors.push({
        path: '$.snapshotReference.snapshotKey',
        message: 'Snapshot key does not match persisted snapshot.',
      });
    }
    if (
      validation.normalized.snapshotReference.snapshotHash !==
      snapshot.approvedDocumentationHash
    ) {
      errors.push({
        path: '$.snapshotReference.snapshotHash',
        message: 'Snapshot hash does not match persisted snapshot.',
      });
    }
    const importHash = createHash('sha256')
      .update(canonicalJson(validation.normalized))
      .digest('hex');
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      previewToken: `roadmap-import-${importHash}`,
      importHash,
      snapshot,
      normalized: validation.normalized,
      summary: {
        milestones: validation.normalized.milestones.length,
        epics: validation.normalized.epics.length,
        backlogCandidates: validation.normalized.backlogCandidates.length,
      },
    };
  }
}
