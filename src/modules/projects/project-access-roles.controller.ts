import { Body, Param, Post } from '@nestjs/common';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  PROJECT_RESOURCE,
  ProjectsControllerRoute,
} from './projects-controller.shared';
import { UpdateProjectAccessRolesDto } from './projects-core.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectAccessRolesController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/access-roles')
  @RequirePermission('projects.project.assign_roles')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectAccessRoles(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectAccessRolesDto,
  ) {
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectAccessRoles(
          principal,
          projectId,
          dto.accessRoleIds,
          session,
        ),
    );
    return {
      id: project.id,
      accessRoleIds: project.accessRoleIds,
      accessPolicyVersion: project.accessPolicyVersion,
    };
  }
}
