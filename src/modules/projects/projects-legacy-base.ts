import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import {
  AccessControlService,
  AppException,
  AuditService,
  ConfigService,
  CrmService,
  IdempotencyService,
  OnModuleInit,
  PrincipalAuthorizationService,
  ProjectBacklogItemDocument,
  ProjectContextSnapshotDocument,
  ProjectDocument,
  ProjectDocumentationDocument,
  ProjectDocumentPageDocument,
  ProjectDocumentPageVersionDocument,
  ProjectMembershipDocument,
  ProjectRoadmapDocument,
  ProjectRoadmapEpicDocument,
  ProjectRoadmapImportDocument,
  ProjectRoadmapMilestoneDocument,
  ProjectRoadmapVersionDocument,
  ProjectSprintDocument,
  ProjectSprintItemDocument,
  REASON_CODES,
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
  ResourceScopeService,
} from './projects-legacy.imports';

export abstract class ProjectsLegacyBase
  implements ResourceScopeResolver, OnModuleInit
{
  constructor(
    protected readonly projectModel: HydratedModel<ProjectDocument>,
    protected readonly projectDocumentationModel: HydratedModel<ProjectDocumentationDocument>,
    protected readonly projectDocumentPageModel: HydratedModel<ProjectDocumentPageDocument>,
    protected readonly projectDocumentPageVersionModel: HydratedModel<ProjectDocumentPageVersionDocument>,
    protected readonly projectContextSnapshotModel: HydratedModel<ProjectContextSnapshotDocument>,
    protected readonly projectBacklogItemModel: HydratedModel<ProjectBacklogItemDocument>,
    protected readonly projectSprintModel: HydratedModel<ProjectSprintDocument>,
    protected readonly projectSprintItemModel: HydratedModel<ProjectSprintItemDocument>,
    protected readonly projectMembershipModel: HydratedModel<ProjectMembershipDocument>,
    protected readonly projectRoadmapModel: HydratedModel<ProjectRoadmapDocument>,
    protected readonly projectRoadmapVersionModel: HydratedModel<ProjectRoadmapVersionDocument>,
    protected readonly projectRoadmapMilestoneModel: HydratedModel<ProjectRoadmapMilestoneDocument>,
    protected readonly projectRoadmapEpicModel: HydratedModel<ProjectRoadmapEpicDocument>,
    protected readonly projectRoadmapImportModel: HydratedModel<ProjectRoadmapImportDocument>,
    protected readonly crmService: CrmService,
    protected readonly accessControlService: AccessControlService,
    protected readonly principalAuthorizationService: PrincipalAuthorizationService,
    protected readonly resourceScopeService: ResourceScopeService,
    protected readonly auditService: AuditService,
    protected readonly idempotencyService: IdempotencyService,
    protected readonly configService: ConfigService,
  ) {}
  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }
  supports(resourceType: string): boolean {
    return resourceType === 'PROJECT';
  }
  protected getDocumentImportPreviewTokenSecret() {
    return (
      this.configService.get<string>('app.documentImportPreviewTokenSecret') ??
      'inflight-project-document-import-preview-v1'
    );
  }
  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const project = await this.projectModel.findById(reference.resourceId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    const moduleKey = reference.moduleKey ?? 'projects';
    return {
      resourceType: 'PROJECT',
      resourceId: project.id,
      organizationId: project.organizationId,
      moduleKey,
      projectId: project.id,
      projectAccessRoleIds: [...project.accessRoleIds],
      candidateScopes: [
        { type: 'PROJECT', id: project.id },
        { type: 'MODULE', id: moduleKey },
        { type: 'ORGANIZATION', id: project.organizationId },
      ],
    };
  }
}
