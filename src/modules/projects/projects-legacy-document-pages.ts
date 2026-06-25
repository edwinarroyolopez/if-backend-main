import { ProjectsLegacySprintActions } from './projects-legacy-sprint-actions';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectDocumentPageInput,
  ProjectDocumentPageUpdate,
} from './projects-legacy.types';
import {
  assertExpectedDocumentPageVersion,
  coerceDocumentPageListResponse,
  coerceDocumentPageReadModel,
  resolveDocumentPageSlug,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyDocumentPages extends ProjectsLegacySprintActions {
  async getProjectDocumentPage(projectId: string, pageId: string) {
    const project = await this.getExistingProject(projectId);
    const page = await this.projectDocumentPageModel.findOne({
      _id: pageId,
      organizationId: project.organizationId,
      projectId: project.id,
    });
    if (!page) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Document page was not found',
      );
    }
    return this.toDocumentPageReadModel(page);
  }
  async createProjectDocumentPageForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ProjectDocumentPageInput,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const slug = resolveDocumentPageSlug(input.slug, input.title);
    const operation = `projects.document_pages.create:${project.id}:${slug}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceDocumentPageReadModel(begun.record.responseBody);
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent document page response is not reusable',
      );
    }
    const page = await this.createProjectDocumentPage(
      principal,
      project,
      { ...input, slug },
      session,
    );
    const response = this.toDocumentPageReadModel(page);
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      { ...response },
      session,
    );
    return response;
  }
  async updateProjectDocumentPage(
    principal: AuthenticatedPrincipal,
    projectId: string,
    pageId: string,
    updates: ProjectDocumentPageUpdate,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const page = await this.getDocumentPageForWrite(project, pageId, session);
    if (page.status === 'APPROVED') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Approved document pages are immutable; create a new draft version instead',
        { currentStatus: page.status },
      );
    }
    assertExpectedDocumentPageVersion(page, updates.expectedVersion);
    const before = this.toDocumentPageAuditSnapshot(page);
    const changed = this.applyProjectDocumentPageUpdates(page, updates);
    if (!changed) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No document page updates were provided',
      );
    }
    page.version += 1;
    page.updatedBy = principal.sub;
    await page.save({ session });
    await this.recordDocumentPageVersion(page, 'UPDATE', session);
    await this.auditDocumentPageChange(
      principal,
      project.organizationId,
      page,
      'projects.documentation.update',
      'projects.documentation.update',
      before,
      this.toDocumentPageAuditSnapshot(page),
      session,
    );
    return this.toDocumentPageReadModel(page);
  }
  async submitProjectDocumentPageReview(
    principal: AuthenticatedPrincipal,
    projectId: string,
    pageId: string,
    expectedVersion: number,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const page = await this.getDocumentPageForWrite(project, pageId, session);
    if (page.status !== 'DRAFT') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Only draft document pages can be submitted for review',
        { currentStatus: page.status },
      );
    }
    assertExpectedDocumentPageVersion(page, expectedVersion);
    const before = this.toDocumentPageAuditSnapshot(page);
    page.status = 'IN_REVIEW';
    page.version += 1;
    page.updatedBy = principal.sub;
    await page.save({ session });
    await this.recordDocumentPageVersion(page, 'SUBMIT_REVIEW', session);
    await this.auditDocumentPageChange(
      principal,
      project.organizationId,
      page,
      'projects.documentation.review',
      'projects.documentation.review',
      before,
      this.toDocumentPageAuditSnapshot(page),
      session,
    );
    return this.toDocumentPageReadModel(page);
  }
  async approveProjectDocumentPageForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    pageId: string,
    expectedVersion: number,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.document_pages.approve:${project.id}:${pageId}:${expectedVersion}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceDocumentPageReadModel(begun.record.responseBody);
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent approval response is not reusable',
      );
    }
    const page = await this.approveProjectDocumentPage(
      principal,
      project,
      pageId,
      expectedVersion,
      session,
    );
    const response = this.toDocumentPageReadModel(page);
    await this.idempotencyService.complete(
      begun.record.id,
      200,
      { ...response },
      session,
    );
    return response;
  }
  async reorderProjectDocumentPagesForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    items: Array<{ id: string; sortOrder: number }>,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.document_pages.reorder:${project.id}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceDocumentPageListResponse(
        begun.record.responseBody,
      );
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent reorder response is not reusable',
      );
    }
    const pages = await this.reorderProjectDocumentPages(
      principal,
      project,
      items,
      session,
    );
    const response = {
      items: pages.map((page) => this.toDocumentPageReadModel(page)),
    };
    await this.idempotencyService.complete(
      begun.record.id,
      200,
      response,
      session,
    );
    return response;
  }
  async archiveProjectDocumentPage(
    principal: AuthenticatedPrincipal,
    projectId: string,
    pageId: string,
    expectedVersion: number,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const page = await this.getDocumentPageForWrite(project, pageId, session);
    if (page.status === 'ARCHIVED') {
      return this.toDocumentPageReadModel(page);
    }
    assertExpectedDocumentPageVersion(page, expectedVersion);
    const before = this.toDocumentPageAuditSnapshot(page);
    page.status = 'ARCHIVED';
    page.version += 1;
    page.updatedBy = principal.sub;
    await page.save({ session });
    await this.recordDocumentPageVersion(page, 'ARCHIVE', session);
    await this.auditDocumentPageChange(
      principal,
      project.organizationId,
      page,
      'projects.documentation.archive',
      'projects.documentation.update',
      before,
      this.toDocumentPageAuditSnapshot(page),
      session,
    );
    return this.toDocumentPageReadModel(page);
  }
}
