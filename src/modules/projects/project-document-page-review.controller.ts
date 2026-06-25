import { Body, Headers, Param, Post } from '@nestjs/common';
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
import { ExpectedProjectDocumentPageVersionDto } from './projects-documentation.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectDocumentPageReviewController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/document-pages/:pageId/submit-review')
  @RequirePermission('projects.documentation.review')
  @ResolveResource(PROJECT_RESOURCE)
  async submitProjectDocumentPageReview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('pageId') pageId: string,
    @Body() dto: ExpectedProjectDocumentPageVersionDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.submitProjectDocumentPageReview(
        principal,
        projectId,
        pageId,
        dto.expectedVersion,
        session,
      ),
    );
  }

  @Post(':projectId/document-pages/:pageId/approve')
  @RequirePermission('projects.documentation.approve')
  @ResolveResource(PROJECT_RESOURCE)
  async approveProjectDocumentPage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('pageId') pageId: string,
    @Body() dto: ExpectedProjectDocumentPageVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.approveProjectDocumentPageForRequest(
        principal,
        projectId,
        pageId,
        dto.expectedVersion,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/document-pages/:pageId/archive')
  @RequirePermission('projects.documentation.archive')
  @ResolveResource(PROJECT_RESOURCE)
  async archiveProjectDocumentPage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('pageId') pageId: string,
    @Body() dto: ExpectedProjectDocumentPageVersionDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.archiveProjectDocumentPage(
        principal,
        projectId,
        pageId,
        dto.expectedVersion,
        session,
      ),
    );
  }
}
