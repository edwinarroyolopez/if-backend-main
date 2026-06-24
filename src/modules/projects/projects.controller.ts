import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import {
  PROJECT_HEALTH_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from 'src/common/types/domain.types';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { ProjectsService } from './projects.service';

class CreateProjectDto {
  @IsString()
  organizationId!: string;

  @IsOptional()
  @IsIn(PROJECT_KINDS)
  projectKind?: ProjectKind;

  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;

  @IsOptional()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds?: string[];
}

class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;
}

class TransitionProjectDto {
  @IsIn(PROJECT_STATUSES)
  targetStatus!: ProjectStatus;
}

class UpdateProjectHealthDto {
  @IsIn(PROJECT_HEALTH_STATUSES)
  health!: ProjectHealth;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  healthReason?: string;
}

class UpdateProjectAccessRolesDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds!: string[];
}

class UpdateProjectDocumentationChecklistItemDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  text!: string;

  @IsBoolean()
  required!: boolean;

  @IsBoolean()
  completed!: boolean;
}

class UpdateProjectDocumentationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentPageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsIn([
    'OVERVIEW',
    'OBJECTIVES',
    'SCOPE',
    'TECHNOLOGIES',
    'ARCHITECTURE',
    'TEAM',
    'RISKS',
    'DEPENDENCIES',
    'DELIVERABLES',
    'DECISIONS',
    'CUSTOM',
  ])
  pageType?:
    | 'OVERVIEW'
    | 'OBJECTIVES'
    | 'SCOPE'
    | 'TECHNOLOGIES'
    | 'ARCHITECTURE'
    | 'TEAM'
    | 'RISKS'
    | 'DEPENDENCIES'
    | 'DELIVERABLES'
    | 'DECISIONS'
    | 'CUSTOM';

  @IsOptional()
  @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED'])
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProjectDocumentationChecklistItemDto)
  checklist?: UpdateProjectDocumentationChecklistItemDto[];
}

class UpdateProjectRoadmapItemDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsIn(['PLANNED', 'ACTIVE', 'DONE', 'BLOCKED', 'CANCELLED'])
  status!: 'PLANNED' | 'ACTIVE' | 'DONE' | 'BLOCKED' | 'CANCELLED';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  owners?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryRisk?: string;
}

class UpdateProjectRoadmapDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PLANNING', 'ACTIVE', 'REVIEW', 'ARCHIVED'])
  status?: 'DRAFT' | 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'ARCHIVED';

  @IsOptional()
  @IsInt()
  @Min(1)
  horizonMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProjectRoadmapItemDto)
  items?: UpdateProjectRoadmapItemDto[];
}

@Controller('projects')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
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
    if (!idempotencyKey) {
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Idempotency-Key header is required',
      );
    }

    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.createProjectForRequest(
          {
            ...dto,
            createdBy: principal.sub,
          },
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
    return {
      items: await this.projectsService.listProjects(principal),
    };
  }

  @Get(':projectId')
  @RequirePermission('projects.project.read')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
  async getProjectReadiness(@Param('projectId') projectId: string) {
    return this.projectsService.getProjectReadiness(projectId);
  }

  @Get(':projectId/documentation')
  @RequirePermission('projects.project.read')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
  async getProjectDocumentation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ) {
    const documentation = await this.projectsService.getProjectDocumentation(
      projectId,
      principal.sub,
    );
    return {
      id: documentation.id,
      projectId: documentation.projectId,
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist,
      createdBy: documentation.createdBy,
      updatedBy: documentation.updatedBy,
      createdAt: documentation.createdAt,
      updatedAt: documentation.updatedAt,
    };
  }

  @Get(':projectId/roadmap')
  @RequirePermission('projects.project.read')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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

  @Patch(':projectId/documentation')
  @RequirePermission('projects.project.update')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
  async updateProjectDocumentation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDocumentationDto,
  ) {
    const documentation = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.updateProjectDocumentation(
          principal,
          projectId,
          dto,
          session,
        ),
    );

    return {
      id: documentation.id,
      projectId: documentation.projectId,
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist,
      createdBy: documentation.createdBy,
      updatedBy: documentation.updatedBy,
      createdAt: documentation.createdAt,
      updatedAt: documentation.updatedAt,
    };
  }

  @Patch(':projectId/roadmap')
  @RequirePermission('projects.project.update')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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

  @Post(':projectId/access-roles')
  @RequirePermission('projects.project.assign_roles')
  @ResolveResource({
    type: 'PROJECT',
    param: 'projectId',
    moduleKey: 'projects',
  })
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
