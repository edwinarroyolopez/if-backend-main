import { Body, Get, Param, Patch } from '@nestjs/common';
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
import { UpdateProjectRoadmapDto } from './projects-roadmap.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectRoadmapController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/roadmap')
  @RequirePermission('projects.project.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectRoadmap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ) {
    const roadmap = await this.projectsService.getProjectRoadmap(
      projectId,
      principal.sub,
    );
    return {
      id: roadmap.id,
      projectId: roadmap.projectId,
      title: roadmap.title,
      status: roadmap.status,
      version: roadmap.version,
      horizonMonths: roadmap.horizonMonths,
      notes: roadmap.notes,
      items: roadmap.items,
      createdBy: roadmap.createdBy,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
    };
  }

  @Patch(':projectId/roadmap')
  @RequirePermission('projects.project.update')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectRoadmap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectRoadmapDto,
  ) {
    const roadmap = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectRoadmap(
          principal,
          projectId,
          dto,
          session,
        ),
    );
    return {
      id: roadmap.id,
      projectId: roadmap.projectId,
      title: roadmap.title,
      status: roadmap.status,
      version: roadmap.version,
      horizonMonths: roadmap.horizonMonths,
      notes: roadmap.notes,
      items: roadmap.items,
      createdBy: roadmap.createdBy,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
    };
  }
}
