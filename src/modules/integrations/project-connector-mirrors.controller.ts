import { Body, Get, Param, Post } from '@nestjs/common';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import {
  PROJECT_RESOURCE,
  ProjectsControllerRoute,
} from 'src/modules/projects/projects-controller.shared';
import { ConnectProjectConnectorDto } from './project-connector-mirror.dto';
import { ProjectConnectorMirrorsService } from './project-connector-mirrors.service';

@ProjectsControllerRoute()
export class ProjectConnectorMirrorsController {
  constructor(
    private readonly mirrorsService: ProjectConnectorMirrorsService,
  ) {}

  @Post(':projectId/integrations/connectors/connect')
  @RequirePermission('projects.integration.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async connect(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: ConnectProjectConnectorDto,
  ) {
    return this.mirrorsService.connect(principal, projectId, dto);
  }

  @Get(':projectId/integrations/connectors')
  @RequirePermission('projects.integration.read')
  @ResolveResource(PROJECT_RESOURCE)
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
  ) {
    return this.mirrorsService.list(principal, projectId);
  }

  @Get(':projectId/integrations/connectors/:mirrorId')
  @RequirePermission('projects.integration.read')
  @ResolveResource(PROJECT_RESOURCE)
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('mirrorId') mirrorId: string,
  ) {
    return this.mirrorsService.get(principal, projectId, mirrorId);
  }

  @Post(':projectId/integrations/connectors/:mirrorId/sync')
  @RequirePermission('projects.integration.manage')
  @ResolveResource(PROJECT_RESOURCE)
  async sync(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Param('mirrorId') mirrorId: string,
  ) {
    return this.mirrorsService.sync(principal, projectId, mirrorId);
  }
}
