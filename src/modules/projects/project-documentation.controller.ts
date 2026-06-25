import { Body, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  PROJECT_RESOURCE,
  ProjectsControllerRoute,
} from './projects-controller.shared';
import { UpdateProjectDocumentationDto } from './projects-documentation.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectDocumentationController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/prompts/documentation-interview')
  @RequirePermission('projects.prompt.generate')
  @ResolveResource(PROJECT_RESOURCE)
  async buildDocumentationInterviewPrompt(
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.buildDocumentationInterviewPrompt(projectId);
  }

  @Get(':projectId/documentation')
  @RequirePermission('projects.project.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectDocumentation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ) {
    const documentation = await this.projectsService.getProjectDocumentation(
      projectId,
      principal.sub,
    );
    return {
      id: documentation.id,
      projectId: documentation.projectId,
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist,
      createdBy: documentation.createdBy,
      updatedBy: documentation.updatedBy,
      createdAt: documentation.createdAt,
      updatedAt: documentation.updatedAt,
    };
  }

  @Patch(':projectId/documentation')
  @RequirePermission('projects.project.update')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectDocumentation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDocumentationDto,
  ) {
    const documentation = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectDocumentation(
          principal,
          projectId,
          dto,
          session,
        ),
    );
    return {
      id: documentation.id,
      projectId: documentation.projectId,
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist,
      createdBy: documentation.createdBy,
      updatedBy: documentation.updatedBy,
      createdAt: documentation.createdAt,
      updatedAt: documentation.updatedAt,
    };
  }
}
