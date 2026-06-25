import {
  AccessControlService,
  AppException,
  AuditService,
  ConfigService,
  CrmService,
  IdempotencyService,
  Model,
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
    protected readonly projectModel: Model<ProjectDocument>,
    protected readonly projectDocumentationModel: Model<ProjectDocumentationDocument>,
    protected readonly projectDocumentPageModel: Model<ProjectDocumentPageDocument>,
    protected readonly projectDocumentPageVersionModel: Model<ProjectDocumentPageVersionDocument>,
    protected readonly projectContextSnapshotModel: Model<ProjectContextSnapshotDocument>,
    protected readonly projectBacklogItemModel: Model<ProjectBacklogItemDocument>,
    protected readonly projectSprintModel: Model<ProjectSprintDocument>,
    protected readonly projectSprintItemModel: Model<ProjectSprintItemDocument>,
    protected readonly projectMembershipModel: Model<ProjectMembershipDocument>,
    protected readonly projectRoadmapModel: Model<ProjectRoadmapDocument>,
    protected readonly projectRoadmapVersionModel: Model<ProjectRoadmapVersionDocument>,
    protected readonly projectRoadmapMilestoneModel: Model<ProjectRoadmapMilestoneDocument>,
    protected readonly projectRoadmapEpicModel: Model<ProjectRoadmapEpicDocument>,
    protected readonly projectRoadmapImportModel: Model<ProjectRoadmapImportDocument>,
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
