import { Body, Get, Headers, Param, Patch, Post } from '@nestjs/common';
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
  requireIdempotencyKey,
} from './projects-controller.shared';
import {
  CreateProjectDocumentPageDto,
  ReorderProjectDocumentPagesDto,
  UpdateProjectDocumentPageDto,
} from './projects-documentation.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectDocumentPagesController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/document-pages')
  @RequirePermission('projects.documentation.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectDocumentPages(@Param('projectId') projectId: string) {
    return {
      items: await this.projectsService.listProjectDocumentPages(projectId),
    };
  }

  @Post(':projectId/document-pages')
  @RequirePermission('projects.documentation.create')
  @ResolveResource(PROJECT_RESOURCE)
  async createProjectDocumentPage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectDocumentPageDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.createProjectDocumentPageForRequest(
        principal,
        projectId,
        dto,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/document-pages/reorder')
  @RequirePermission('projects.documentation.update')
  @ResolveResource(PROJECT_RESOURCE)
  async reorderProjectDocumentPages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderProjectDocumentPagesDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.reorderProjectDocumentPagesForRequest(
        principal,
        projectId,
        dto.items,
        idempotencyKey,
        session,
      ),
    );
  }

  @Get(':projectId/document-pages/:pageId')
  @RequirePermission('projects.documentation.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectDocumentPage(
    @Param('projectId') projectId: string,
    @Param('pageId') pageId: string,
  ) {
    return this.projectsService.getProjectDocumentPage(projectId, pageId);
  }

  @Patch(':projectId/document-pages/:pageId')
  @RequirePermission('projects.documentation.update')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectDocumentPage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdateProjectDocumentPageDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.updateProjectDocumentPage(
        principal,
        projectId,
        pageId,
        dto,
        session,
      ),
    );
  }
}
