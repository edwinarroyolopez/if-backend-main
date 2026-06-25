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
import { CommitBacklogImportFromRoadmapDto } from './projects-backlog.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectBacklogImportsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/backlog/import-from-roadmap/preview')
  @RequirePermission('projects.backlog.create')
  @ResolveResource(PROJECT_RESOURCE)
  async previewBacklogImportFromRoadmap(@Param('projectId') projectId: string) {
    return this.projectsService.previewBacklogImportFromRoadmap(projectId);
  }

  @Post(':projectId/backlog/import-from-roadmap/commit')
  @RequirePermission('projects.backlog.create')
  @ResolveResource(PROJECT_RESOURCE)
  async commitBacklogImportFromRoadmap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CommitBacklogImportFromRoadmapDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.commitBacklogImportFromRoadmapForRequest(
        principal,
        projectId,
        dto.previewToken,
        idempotencyKey,
        session,
      ),
    );
  }
}
