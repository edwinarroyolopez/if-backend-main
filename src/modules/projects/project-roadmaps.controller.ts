import { Get, Param, Post } from '@nestjs/common';
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
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectRoadmapsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/roadmaps')
  @RequirePermission('projects.roadmap.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectRoadmaps(@Param('projectId') projectId: string) {
    return { items: await this.projectsService.listProjectRoadmaps(projectId) };
  }

  @Get(':projectId/roadmaps/:roadmapId')
  @RequirePermission('projects.roadmap.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getVersionedProjectRoadmap(
    @Param('projectId') projectId: string,
    @Param('roadmapId') roadmapId: string,
  ) {
    return this.projectsService.getVersionedProjectRoadmap(
      projectId,
      roadmapId,
    );
  }

  @Post(':projectId/roadmaps/:roadmapId/activate')
  @RequirePermission('projects.roadmap.activate')
  @ResolveResource(PROJECT_RESOURCE)
  async activateProjectRoadmap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('roadmapId') roadmapId: string,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.activateProjectRoadmapForRequest(
        principal,
        projectId,
        roadmapId,
        session,
      ),
    );
  }

  @Post(':projectId/roadmaps/:roadmapId/archive')
  @RequirePermission('projects.roadmap.archive')
  @ResolveResource(PROJECT_RESOURCE)
  async archiveProjectRoadmap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('roadmapId') roadmapId: string,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.archiveProjectRoadmapForRequest(
        principal,
        projectId,
        roadmapId,
        session,
      ),
    );
  }
}
