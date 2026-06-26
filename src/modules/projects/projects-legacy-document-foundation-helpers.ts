import { ProjectsLegacySprintWorkflowHelpers } from './projects-legacy-sprint-workflow-helpers';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  ProjectBacklogItemDocument,
  ProjectDocument,
  ProjectDocumentPageDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import { ProjectBacklogItemReadModel } from './projects-legacy.types';
import { toPlainDocumentChecklistItem } from './projects-legacy.utils';

export abstract class ProjectsLegacyDocumentFoundationHelpers extends ProjectsLegacySprintWorkflowHelpers {
  protected toBacklogItemReadModel(
    item: ProjectBacklogItemDocument,
  ): ProjectBacklogItemReadModel {
    return {
      id: item.id,
      organizationId: item.organizationId,
      projectId: item.projectId,
      roadmapId: item.roadmapId,
      roadmapVersionId: item.roadmapVersionId,
      milestoneId: item.milestoneId,
      milestoneKey: item.milestoneKey,
      milestoneTitle: item.milestoneTitle,
      epicId: item.epicId,
      epicKey: item.epicKey,
      epicTitle: item.epicTitle,
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      estimate: item.estimate,
      status: item.status,
      acceptanceCriteria: [...item.acceptanceCriteria],
      sourceReferences: [...item.sourceReferences],
      traceability: { ...item.traceability },
      order: item.order,
      assigneeId: item.assigneeId,
      sourceCandidateKey: item.sourceCandidateKey,
      version: item.version,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      createdAt: item.createdAt?.toISOString(),
      updatedAt: item.updatedAt?.toISOString(),
      archivedAt: item.archivedAt?.toISOString(),
    };
  }

  protected async getExistingProject(projectId: string) {
    const project = await this.projectModel.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return project;
  }

  protected async getDocumentPageForWrite(
    project: ProjectDocument,
    pageId: string,
    session: ClientSession,
  ) {
    const page = await this.projectDocumentPageModel
      .findOne({
        _id: pageId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (!page) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Document page was not found',
      );
    }
    return page;
  }

  protected async recordDocumentPageVersion(
    page: ProjectDocumentPageDocument,
    changeType: string,
    session: ClientSession,
  ) {
    await this.projectDocumentPageVersionModel.create(
      [
        {
          organizationId: page.organizationId,
          projectId: page.projectId,
          pageId: page.id,
          pageVersion: page.version,
          parentPageId: page.parentPageId,
          title: page.title,
          slug: page.slug,
          summary: page.summary,
          bodyMarkdown: page.bodyMarkdown,
          pageType: page.pageType,
          status: page.status,
          source: page.source,
          sortOrder: page.sortOrder,
          checklist: page.checklist.map(toPlainDocumentChecklistItem),
          facts: [...page.facts],
          assumptions: [...page.assumptions],
          decisions: [...page.decisions],
          risks: [...page.risks],
          openQuestions: [...page.openQuestions],
          sourceImportId: page.sourceImportId,
          createdBy: page.createdBy,
          updatedBy: page.updatedBy,
          changeType,
        },
      ],
      { session },
    );
  }

  protected async auditDocumentPageChange(
    principal: AuthenticatedPrincipal,
    organizationId: string,
    page: ProjectDocumentPageDocument,
    action: string,
    permissionKey: string,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown>,
    session: ClientSession,
  ) {
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId,
        action,
        resourceType: 'PROJECT_DOCUMENT_PAGE',
        resourceId: page.id,
        permissionKey,
        before,
        after,
        metadata: { projectId: page.projectId },
      },
      session,
    );
  }

  protected toDocumentPageAuditSnapshot(page: ProjectDocumentPageDocument) {
    return {
      parentPageId: page.parentPageId,
      title: page.title,
      slug: page.slug,
      summary: page.summary,
      bodyMarkdown: page.bodyMarkdown,
      pageType: page.pageType,
      status: page.status,
      source: page.source,
      sortOrder: page.sortOrder,
      version: page.version,
      checklist: page.checklist.map(toPlainDocumentChecklistItem),
      facts: [...page.facts],
      assumptions: [...page.assumptions],
      decisions: [...page.decisions],
      risks: [...page.risks],
      openQuestions: [...page.openQuestions],
      sourceImportId: page.sourceImportId,
    };
  }
}
