import { Body, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  PROJECT_RESOURCE,
  ProjectsControllerRoute,
  requireIdempotencyKey,
} from './projects-controller.shared';
import {
  CreateProjectDto,
  TransitionProjectDto,
  UpdateProjectDto,
  UpdateProjectHealthDto,
} from './projects-core.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post()
  @RequirePermission('projects.project.create')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'projects',
  })
  async createProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateProjectDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.createProjectForRequest(
          { ...dto, createdBy: principal.sub },
          idempotencyKey,
          session,
        ),
    );
    return project;
  }

  @Get()
  @RequirePermission('projects.project.read')
  @ResolveResource({
    type: 'MODULE',
    moduleKey: 'projects',
    allowProjectScope: true,
  })
  async listProjects(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { items: await this.projectsService.listProjects(principal) };
  }

  @Get(':projectId')
  @RequirePermission('projects.project.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProject(@Param('projectId') projectId: string) {
    const project = await this.projectsService.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    return this.projectsService.toReadModel(project);
  }

  @Patch(':projectId')
  @RequirePermission('projects.project.update')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectDetails(
          principal,
          projectId,
          dto,
          session,
        ),
    );
    return this.projectsService.toReadModel(project);
  }

  @Post(':projectId/transitions')
  @RequirePermission('projects.project.transition')
  @ResolveResource(PROJECT_RESOURCE)
  async transitionProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: TransitionProjectDto,
  ) {
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.transitionProject(
          principal,
          projectId,
          dto.targetStatus,
          session,
        ),
    );
    return this.projectsService.toReadModel(project);
  }

  @Post(':projectId/health')
  @RequirePermission('projects.project.health')
  @ResolveResource(PROJECT_RESOURCE)
  async updateProjectHealth(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectHealthDto,
  ) {
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectHealth(
          principal,
          projectId,
          dto,
          session,
        ),
    );
    return this.projectsService.toReadModel(project);
  }

  @Get(':projectId/readiness')
  @RequirePermission('projects.project.read')
  @ResolveResource(PROJECT_RESOURCE)
  async getProjectReadiness(@Param('projectId') projectId: string) {
    return this.projectsService.getProjectReadiness(projectId);
  }
}
