import { Body, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
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
import {
  CreateProjectBacklogItemDto,
  ReorderProjectBacklogItemsDto,
  UpdateProjectBacklogItemDto,
} from './projects-backlog.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectBacklogController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/backlog')
  @RequirePermission('projects.backlog.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectBacklogItems(
    @Param('projectId') projectId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.projectsService.listProjectBacklogItems(
      projectId,
      includeArchived === 'true',
    );
  }

  @Post(':projectId/backlog')
  @RequirePermission('projects.backlog.create')
  @ResolveResource(PROJECT_RESOURCE)
  async createProjectBacklogItem(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectBacklogItemDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.createProjectBacklogItemForRequest(
        principal,
        projectId,
        dto,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/backlog/reorder')
  @RequirePermission('projects.backlog.prioritize')
  @ResolveResource(PROJECT_RESOURCE)
  async reorderProjectBacklogItems(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderProjectBacklogItemsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.reorderProjectBacklogItemsForRequest(
        principal,
        projectId,
        dto.items,
        idempotencyKey,
        session,
      ),
    );
  }

  @Patch(':projectId/backlog/:itemId')
  @RequirePermission('projects.backlog.update')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectBacklogItem(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateProjectBacklogItemDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.updateProjectBacklogItem(
        principal,
        projectId,
        itemId,
        dto,
        session,
      ),
    );
  }

  @Post(':projectId/backlog/:itemId/archive')
  @RequirePermission('projects.backlog.update')
  @ResolveResource(PROJECT_RESOURCE)
  async archiveProjectBacklogItem(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ExpectedProjectDocumentPageVersionDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.archiveProjectBacklogItem(
        principal,
        projectId,
        itemId,
        dto.expectedVersion,
        session,
      ),
    );
  }
}
