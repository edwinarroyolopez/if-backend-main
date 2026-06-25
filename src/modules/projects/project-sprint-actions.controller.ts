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
import { MoveProjectSprintItemDto } from './projects-sprints.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectSprintActionsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/sprints/:sprintId/start')
  @RequirePermission('projects.sprint.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async startProjectSprint(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.startProjectSprintForRequest(
        principal,
        projectId,
        sprintId,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/sprints/:sprintId/complete')
  @RequirePermission('projects.sprint.complete')
  @ResolveResource(PROJECT_RESOURCE)
  async completeProjectSprint(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.completeProjectSprintForRequest(
        principal,
        projectId,
        sprintId,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/sprints/:sprintId/cancel')
  @RequirePermission('projects.sprint.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async cancelProjectSprint(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.cancelProjectSprintForRequest(
        principal,
        projectId,
        sprintId,
        idempotencyKey,
        session,
      ),
    );
  }

  @Post(':projectId/sprints/:sprintId/board-move')
  @RequirePermission('projects.sprint.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async moveProjectSprintItem(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: MoveProjectSprintItemDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.moveProjectSprintItem(
        principal,
        projectId,
        sprintId,
        dto,
        session,
      ),
    );
  }
}
