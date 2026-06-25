import { Body, Get, Headers, Param, Post } from '@nestjs/common';
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
  AddProjectSprintItemsDto,
  CreateProjectSprintDto,
} from './projects-sprints.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectSprintsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/sprints')
  @RequirePermission('projects.sprint.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectSprints(@Param('projectId') projectId: string) {
    return this.projectsService.listProjectSprints(projectId);
  }

  @Post(':projectId/sprints')
  @RequirePermission('projects.sprint.create')
  @ResolveResource(PROJECT_RESOURCE)
  async createProjectSprint(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectSprintDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.createProjectSprintForRequest(
        principal,
        projectId,
        dto,
        idempotencyKey,
        session,
      ),
    );
  }

  @Get(':projectId/sprints/:sprintId')
  @RequirePermission('projects.sprint.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectSprint(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.projectsService.getProjectSprint(projectId, sprintId);
  }

  @Post(':projectId/sprints/:sprintId/add-items')
  @RequirePermission('projects.sprint.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async addProjectSprintItems(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: AddProjectSprintItemsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.addProjectSprintItemsForRequest(
        principal,
        projectId,
        sprintId,
        dto,
        idempotencyKey,
        session,
      ),
    );
  }
}
