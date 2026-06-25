import { ProjectsLegacyProjectUpdates } from './projects-legacy-project-updates';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
  assertDocumentImportPreviewToken,
  buildDocumentImportPreview,
  buildDocumentationPromptResponse,
} from './projects-legacy.imports';
import { ProjectDocumentPageReadModel } from './projects-legacy.types';
import {
  coerceDocumentImportCommitResponse,
  sanitizeDocumentImportPreview,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyDocumentImports extends ProjectsLegacyProjectUpdates {
  async listProjectDocumentPages(projectId: string) {
    const project = await this.getExistingProject(projectId);
    const pages = await this.projectDocumentPageModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ sortOrder: 1, createdAt: 1 });
    return pages.map((page) => this.toDocumentPageReadModel(page));
  }
  async buildDocumentationInterviewPrompt(projectId: string) {
    const project = await this.getExistingProject(projectId);
    return buildDocumentationPromptResponse(this.toReadModel(project));
  }
  async previewProjectDocumentImport(
    projectId: string,
    documentImport: unknown,
  ) {
    const project = await this.getExistingProject(projectId);
    const existingPages = await this.projectDocumentPageModel.find({
      organizationId: project.organizationId,
      projectId: project.id,
    });
    return sanitizeDocumentImportPreview(
      buildDocumentImportPreview(
        this.toReadModel(project),
        documentImport,
        existingPages.map((page) => page.slug),
        this.getDocumentImportPreviewTokenSecret(),
      ),
    );
  }
  async commitProjectDocumentImportForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    documentImport: unknown,
    previewToken: string,
    idempotencyKey: string,
    session: ClientSession,
  ) {
    const project = await this.getProjectForWrite(projectId, session);
    const operation = `projects.document_imports.commit:${project.id}:${previewToken}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceDocumentImportCommitResponse(
        begun.record.responseBody,
      );
      if (response) {
        return response;
      }
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent document import response is not reusable',
      );
    }
    const existingPages = await this.projectDocumentPageModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .session(session);
    const preview = buildDocumentImportPreview(
      this.toReadModel(project),
      documentImport,
      existingPages.map((page) => page.slug),
      this.getDocumentImportPreviewTokenSecret(),
    );
    assertDocumentImportPreviewToken(
      project.id,
      preview.normalizedPages,
      previewToken,
      this.getDocumentImportPreviewTokenSecret(),
    );
    const sourceImportId = previewToken.slice(0, 96);
    const pages: ProjectDocumentPageReadModel[] = [];
    for (const page of preview.normalizedPages) {
      const documentPage = await this.createProjectDocumentPage(
        principal,
        project,
        {
          title: page.title,
          slug: page.slug,
          summary: page.summary,
          bodyMarkdown: page.bodyMarkdown,
          pageType: page.pageType,
          status: 'DRAFT',
          source: 'AI_IMPORT',
          sortOrder: page.sortOrder,
          checklist: page.checklist,
          facts: page.facts,
          assumptions: page.assumptions,
          decisions: page.decisions,
          risks: page.risks,
          openQuestions: page.openQuestions,
          sourceImportId,
        },
        session,
      );
      pages.push(this.toDocumentPageReadModel(documentPage));
    }
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.documentation.import_commit',
        resourceType: 'PROJECT',
        resourceId: project.id,
        permissionKey: 'projects.documentation.import',
        after: {
          sourceImportId,
          pageIds: pages.map((page) => page.id),
          slugs: pages.map((page) => page.slug),
          status: 'DRAFT',
        },
      },
      session,
    );
    const response = {
      committed: true,
      sourceImportId,
      summary: {
        pagesCreated: pages.length,
        draftPagesCreated: pages.filter((page) => page.status === 'DRAFT')
          .length,
      },
      pages,
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
