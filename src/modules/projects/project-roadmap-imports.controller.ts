import { Body, Headers, Param, Post } from '@nestjs/common';
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
  BuildRoadmapPromptDto,
  CommitProjectRoadmapImportDto,
  PreviewProjectRoadmapImportDto,
} from './projects-roadmap.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectRoadmapImportsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/prompts/roadmap')
  @RequirePermission('projects.prompt.generate')
  @ResolveResource(PROJECT_RESOURCE)
  async buildRoadmapPrompt(
    @Param('projectId') projectId: string,
    @Body() dto: BuildRoadmapPromptDto,
  ) {
    return this.projectsService.buildRoadmapPrompt(
      projectId,
      dto.snapshotId,
      dto.roadmapDraft,
    );
  }

  @Post(':projectId/roadmap-imports/preview')
  @RequirePermission('projects.roadmap.import')
  @ResolveResource(PROJECT_RESOURCE)
  async previewProjectRoadmapImport(
    @Param('projectId') projectId: string,
    @Body() dto: PreviewProjectRoadmapImportDto,
  ) {
    return this.projectsService.previewProjectRoadmapImport(
      projectId,
      dto.roadmapImport,
    );
  }

  @Post(':projectId/roadmap-imports/commit')
  @RequirePermission('projects.roadmap.import')
  @ResolveResource(PROJECT_RESOURCE)
  async commitProjectRoadmapImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CommitProjectRoadmapImportDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.commitProjectRoadmapImportForRequest(
        principal,
        projectId,
        dto.roadmapImport,
        dto.previewToken,
        idempotencyKey,
        session,
      ),
    );
  }
}
