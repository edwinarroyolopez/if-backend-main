import { Get, Headers, Param, Post } from '@nestjs/common';
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
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectContextSnapshotsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/context-snapshots')
  @RequirePermission('projects.snapshot.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectContextSnapshots(@Param('projectId') projectId: string) {
    return {
      items: await this.projectsService.listProjectContextSnapshots(projectId),
    };
  }

  @Post(':projectId/context-snapshots')
  @RequirePermission('projects.snapshot.create')
  @ResolveResource(PROJECT_RESOURCE)
  async createProjectContextSnapshot(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.createProjectContextSnapshotForRequest(
        principal,
        projectId,
        idempotencyKey,
        session,
      ),
    );
  }

  @Get(':projectId/context-snapshots/:snapshotId')
  @RequirePermission('projects.snapshot.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectContextSnapshot(
    @Param('projectId') projectId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.projectsService.getProjectContextSnapshot(
      projectId,
      snapshotId,
    );
  }
}
