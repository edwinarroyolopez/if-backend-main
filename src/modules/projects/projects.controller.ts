import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
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
}

@Controller('projects')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
    const project = await this.projectsService.createProject({
      ...dto,
      createdBy: principal.sub,
    });
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      status: project.status,
    };
  }

  @Get()
  @RequirePermission('projects.project.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'projects' })
  async listProjects(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      items: await this.projectsService.listProjects(
        principal.activeOrganizationId!,
      ),
    };
  }
}
