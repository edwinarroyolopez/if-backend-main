import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
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
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { ProjectsService } from './projects.service';

class CreateProjectDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  clientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds?: string[];
}

class UpdateProjectAccessRolesDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds!: string[];
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
  ) {
    const project = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.projectsService.createProject(
          {
            ...dto,
            createdBy: principal.sub,
          },
          session,
        ),
    );
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      status: project.status,
      accessRoleIds: project.accessRoleIds,
    };
  }

  @Get()
  @RequirePermission('projects.project.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'projects', allowProjectScope: true })
  async listProjects(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      items: await this.projectsService.listProjects(principal),
    };
  }

  @Get(':projectId')
  @RequirePermission('projects.project.read')
  @ResolveResource({ type: 'PROJECT', param: 'projectId', moduleKey: 'projects' })
  async getProject(@Param('projectId') projectId: string) {
    const project = await this.projectsService.findById(projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      clientId: project.clientId,
      status: project.status,
      accessRoleIds: project.accessRoleIds,
    };
  }

  @Post(':projectId/access-roles')
  @RequirePermission('projects.project.assign_roles')
  @ResolveResource({ type: 'PROJECT', param: 'projectId', moduleKey: 'projects' })
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
