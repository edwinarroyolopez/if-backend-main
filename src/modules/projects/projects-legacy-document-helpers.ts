import { ProjectsLegacyDocumentFoundationHelpers } from './projects-legacy-document-foundation-helpers';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  PROJECT_DOCUMENT_PAGE_TYPES,
  ProjectDocument,
  ProjectDocumentPageDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectDocumentPageInput,
  ProjectDocumentPageUpdate,
} from './projects-legacy.types';
import {
  areDocumentChecklistsEqual,
  areStringListsEqual,
  assertExpectedDocumentPageVersion,
  documentTraceabilityFields,
  isDuplicateKeyError,
  normalizeDocumentChecklist,
  normalizeOptionalText,
  normalizeStringList,
  resolveDocumentPageSlug,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyDocumentHelpers extends ProjectsLegacyDocumentFoundationHelpers {
  protected async createProjectDocumentPage(
    principal: AuthenticatedPrincipal,
    project: ProjectDocument,
    input: ProjectDocumentPageInput,
    session: ClientSession,
  ) {
    const existingPageCount = await this.projectDocumentPageModel
      .countDocuments({
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    const slug = resolveDocumentPageSlug(input.slug, input.title);
    const pageType = input.pageType ?? 'OVERVIEW';
    if (!PROJECT_DOCUMENT_PAGE_TYPES.includes(pageType)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Document page type is not supported',
        { field: 'pageType' },
      );
    }
    try {
      const [page] = await this.projectDocumentPageModel.create(
        [
          {
            organizationId: project.organizationId,
            projectId: project.id,
            parentPageId: normalizeOptionalText(input.parentPageId),
            title: input.title.trim(),
            slug,
            summary: normalizeOptionalText(input.summary),
            bodyMarkdown: normalizeOptionalText(input.bodyMarkdown),
            pageType,
            status: input.status ?? 'DRAFT',
            source: input.source ?? 'MANUAL',
            sortOrder: input.sortOrder ?? existingPageCount,
            version: 1,
            checklist: normalizeDocumentChecklist(input.checklist),
            facts: normalizeStringList(input.facts),
            assumptions: normalizeStringList(input.assumptions),
            decisions: normalizeStringList(input.decisions),
            risks: normalizeStringList(input.risks),
            openQuestions: normalizeStringList(input.openQuestions),
            sourceImportId: normalizeOptionalText(input.sourceImportId),
            createdBy: principal.sub,
            updatedBy: principal.sub,
          },
        ],
        { session },
      );
      await this.recordDocumentPageVersion(page, 'CREATE', session);
      await this.auditDocumentPageChange(
        principal,
        project.organizationId,
        page,
        'projects.documentation.create',
        'projects.documentation.create',
        undefined,
        this.toDocumentPageAuditSnapshot(page),
        session,
      );
      return page;
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Document page slug already exists in this project',
          { field: 'slug', suggestedSlug: `${slug}-2` },
        );
      }
      throw error;
    }
  }
  protected applyProjectDocumentPageUpdates(
    page: ProjectDocumentPageDocument,
    updates: ProjectDocumentPageUpdate,
  ) {
    let changed = false;
    const nextSlug =
      updates.slug !== undefined
        ? resolveDocumentPageSlug(updates.slug, page.title)
        : undefined;
    if (updates.parentPageId !== undefined) {
      const value = normalizeOptionalText(updates.parentPageId);
      if (value !== page.parentPageId) {
        page.parentPageId = value;
        changed = true;
      }
    }
    if (updates.title !== undefined && updates.title.trim() !== page.title) {
      page.title = updates.title.trim();
      changed = true;
    }
    if (nextSlug !== undefined && nextSlug !== page.slug) {
      page.slug = nextSlug;
      changed = true;
    }
    if (updates.summary !== undefined) {
      const value = normalizeOptionalText(updates.summary);
      if (value !== page.summary) {
        page.summary = value;
        changed = true;
      }
    }
    if (updates.bodyMarkdown !== undefined) {
      const value = normalizeOptionalText(updates.bodyMarkdown);
      if (value !== page.bodyMarkdown) {
        page.bodyMarkdown = value;
        changed = true;
      }
    }
    if (updates.pageType !== undefined && updates.pageType !== page.pageType) {
      page.pageType = updates.pageType;
      changed = true;
    }
    if (
      updates.sortOrder !== undefined &&
      updates.sortOrder !== page.sortOrder
    ) {
      page.sortOrder = updates.sortOrder;
      changed = true;
    }
    if (updates.checklist !== undefined) {
      const nextChecklist = normalizeDocumentChecklist(updates.checklist);
      if (!areDocumentChecklistsEqual(page.checklist, nextChecklist)) {
        page.checklist = nextChecklist;
        changed = true;
      }
    }
    for (const field of documentTraceabilityFields) {
      if (updates[field] === undefined) {
        continue;
      }
      const nextList = normalizeStringList(updates[field]);
      if (!areStringListsEqual(page[field], nextList)) {
        page[field] = nextList;
        changed = true;
      }
    }
    if (updates.sourceImportId !== undefined) {
      const value = normalizeOptionalText(updates.sourceImportId);
      if (value !== page.sourceImportId) {
        page.sourceImportId = value;
        changed = true;
      }
    }
    return changed;
  }
  protected async approveProjectDocumentPage(
    principal: AuthenticatedPrincipal,
    project: ProjectDocument,
    pageId: string,
    expectedVersion: number,
    session: ClientSession,
  ) {
    const page = await this.getDocumentPageForWrite(project, pageId, session);
    if (page.status !== 'IN_REVIEW') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Only in-review document pages can be approved',
        { currentStatus: page.status },
      );
    }
    assertExpectedDocumentPageVersion(page, expectedVersion);
    const before = this.toDocumentPageAuditSnapshot(page);
    page.status = 'APPROVED';
    page.version += 1;
    page.updatedBy = principal.sub;
    await page.save({ session });
    await this.recordDocumentPageVersion(page, 'APPROVE', session);
    await this.auditDocumentPageChange(
      principal,
      project.organizationId,
      page,
      'projects.documentation.approve',
      'projects.documentation.approve',
      before,
      this.toDocumentPageAuditSnapshot(page),
      session,
    );
    return page;
  }
  protected async reorderProjectDocumentPages(
    principal: AuthenticatedPrincipal,
    project: ProjectDocument,
    items: Array<{ id: string; sortOrder: number }>,
    session: ClientSession,
  ) {
    const pageIds = items.map((item) => item.id);
    const pages = await this.projectDocumentPageModel
      .find({
        _id: { $in: pageIds },
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (pages.length !== pageIds.length) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'One or more document pages were not found',
      );
    }
    const orderByPageId = new Map(
      items.map((item) => [item.id, item.sortOrder] as const),
    );
    for (const page of pages) {
      const nextSortOrder = orderByPageId.get(page.id);
      if (nextSortOrder === undefined || nextSortOrder === page.sortOrder) {
        continue;
      }
      const before = this.toDocumentPageAuditSnapshot(page);
      page.sortOrder = nextSortOrder;
      page.version += 1;
      page.updatedBy = principal.sub;
      await page.save({ session });
      await this.recordDocumentPageVersion(page, 'REORDER', session);
      await this.auditDocumentPageChange(
        principal,
        project.organizationId,
        page,
        'projects.documentation.reorder',
        'projects.documentation.update',
        before,
        this.toDocumentPageAuditSnapshot(page),
        session,
      );
    }
    return this.projectDocumentPageModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ sortOrder: 1, createdAt: 1 })
      .session(session);
  }
}
