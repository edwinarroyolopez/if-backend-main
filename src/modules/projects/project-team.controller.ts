import { Body, Get, Headers, Param, Patch, Post } from '@nestjs/common';
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
  CreateProjectMembershipDto,
  ExpectedProjectMembershipVersionDto,
  UpdateProjectMembershipDto,
} from './projects-team.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectTeamController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get(':projectId/team')
  @RequirePermission('projects.team.read')
  @ResolveResource(PROJECT_RESOURCE)
  async listProjectTeam(@Param('projectId') projectId: string) {
    return this.projectsService.listProjectTeam(projectId);
  }

  @Post(':projectId/team')
  @RequirePermission('projects.team.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async createProjectMembership(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectMembershipDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.createProjectMembershipForRequest(
        principal,
        projectId,
        dto,
        idempotencyKey,
        session,
      ),
    );
  }

  @Patch(':projectId/team/:membershipId')
  @RequirePermission('projects.team.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectMembership(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateProjectMembershipDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.updateProjectMembership(
        principal,
        projectId,
        membershipId,
        dto,
        session,
      ),
    );
  }

  @Post(':projectId/team/:membershipId/deactivate')
  @RequirePermission('projects.team.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async deactivateProjectMembership(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ExpectedProjectMembershipVersionDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.deactivateProjectMembership(
        principal,
        projectId,
        membershipId,
        dto.expectedVersion,
        session,
      ),
    );
  }

  @Post(':projectId/team/:membershipId/activate')
  @RequirePermission('projects.team.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async activateProjectMembership(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ExpectedProjectMembershipVersionDto,
  ) {
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.activateProjectMembership(
        principal,
        projectId,
        membershipId,
        dto.expectedVersion,
        session,
      ),
    );
  }
}
