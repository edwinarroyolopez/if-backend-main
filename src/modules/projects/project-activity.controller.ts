import { Get, Param, Query } from '@nestjs/common';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import {
  PROJECT_RESOURCE,
  ProjectsControllerRoute,
} from './projects-controller.shared';
import { ProjectActivityQueryDto } from './projects-activity.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectActivityController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(':projectId/activity')
  @RequirePermission('projects.activity.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectActivity(
    @Param('projectId') projectId: string,
    @Query() query: ProjectActivityQueryDto,
  ) {
    return this.projectsService.listProjectActivity(projectId, query);
  }
}
