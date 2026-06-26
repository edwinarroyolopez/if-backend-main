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
  CommitProjectDocumentImportDto,
  PreviewProjectDocumentImportDto,
} from './projects-document-import.dto';
import { ProjectsService } from './projects.service';

@ProjectsControllerRoute()
export class ProjectDocumentImportsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post(':projectId/document-imports/preview')
  @RequirePermission('projects.documentation.import')
  @ResolveResource(PROJECT_RESOURCE)
  async previewProjectDocumentImport(
    @Param('projectId') projectId: string,
    @Body() dto: PreviewProjectDocumentImportDto,
  ) {
    return this.projectsService.previewProjectDocumentImport(
      projectId,
      dto.documentImport,
    );
  }

  @Post(':projectId/document-imports/commit')
  @RequirePermission('projects.documentation.import')
  @ResolveResource(PROJECT_RESOURCE)
  async commitProjectDocumentImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId') projectId: string,
    @Body() dto: CommitProjectDocumentImportDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    requireIdempotencyKey(idempotencyKey);
    return this.transactionManagerService.runInTransaction((session) =>
      this.projectsService.commitProjectDocumentImportForRequest(
        principal,
        projectId,
        dto.documentImport,
        dto.previewToken,
        idempotencyKey,
        session,
      ),
    );
  }
}
