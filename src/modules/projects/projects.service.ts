import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CrmService } from 'src/modules/crm/crm.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
import {
  ProjectBacklogItem,
  ProjectBacklogItemDocument,
} from './project-backlog-item.schema';
import {
  ProjectContextSnapshot,
  ProjectContextSnapshotDocument,
} from './project-context-snapshot.schema';
import {
  ProjectDocumentPage,
  ProjectDocumentPageDocument,
} from './project-document-page.schema';
import {
  ProjectDocumentPageVersion,
  ProjectDocumentPageVersionDocument,
} from './project-document-page-version.schema';
import {
  ProjectDocumentation,
  ProjectDocumentationDocument,
} from './project-documentation.schema';
import {
  ProjectMembership,
  ProjectMembershipDocument,
} from './project-membership.schema';
import {
  ProjectRoadmapEpic,
  ProjectRoadmapEpicDocument,
} from './project-roadmap-epic.schema';
import {
  ProjectRoadmapImport,
  ProjectRoadmapImportDocument,
} from './project-roadmap-import.schema';
import {
  ProjectRoadmapMilestone,
  ProjectRoadmapMilestoneDocument,
} from './project-roadmap-milestone.schema';
import {
  ProjectRoadmapVersion,
  ProjectRoadmapVersionDocument,
} from './project-roadmap-version.schema';
import {
  ProjectRoadmap,
  ProjectRoadmapDocument,
} from './project-roadmap.schema';
import {
  ProjectSprintItem,
  ProjectSprintItemDocument,
} from './project-sprint-item.schema';
import { ProjectSprint, ProjectSprintDocument } from './project-sprint.schema';
import { Project, ProjectDocument } from './project.schema';
import { ProjectsLegacyService } from './projects-legacy';

export * from './projects-legacy';

@Injectable()
export class ProjectsService extends ProjectsLegacyService {
  constructor(
    @InjectModel(Project.name) projectModel: Model<ProjectDocument>,
    @InjectModel(ProjectDocumentation.name)
    projectDocumentationModel: Model<ProjectDocumentationDocument>,
    @InjectModel(ProjectDocumentPage.name)
    projectDocumentPageModel: Model<ProjectDocumentPageDocument>,
    @InjectModel(ProjectDocumentPageVersion.name)
    projectDocumentPageVersionModel: Model<ProjectDocumentPageVersionDocument>,
    @InjectModel(ProjectContextSnapshot.name)
    projectContextSnapshotModel: Model<ProjectContextSnapshotDocument>,
    @InjectModel(ProjectBacklogItem.name)
    projectBacklogItemModel: Model<ProjectBacklogItemDocument>,
    @InjectModel(ProjectSprint.name)
    projectSprintModel: Model<ProjectSprintDocument>,
    @InjectModel(ProjectSprintItem.name)
    projectSprintItemModel: Model<ProjectSprintItemDocument>,
    @InjectModel(ProjectMembership.name)
    projectMembershipModel: Model<ProjectMembershipDocument>,
    @InjectModel(ProjectRoadmap.name)
    projectRoadmapModel: Model<ProjectRoadmapDocument>,
    @InjectModel(ProjectRoadmapVersion.name)
    projectRoadmapVersionModel: Model<ProjectRoadmapVersionDocument>,
    @InjectModel(ProjectRoadmapMilestone.name)
    projectRoadmapMilestoneModel: Model<ProjectRoadmapMilestoneDocument>,
    @InjectModel(ProjectRoadmapEpic.name)
    projectRoadmapEpicModel: Model<ProjectRoadmapEpicDocument>,
    @InjectModel(ProjectRoadmapImport.name)
    projectRoadmapImportModel: Model<ProjectRoadmapImportDocument>,
    crmService: CrmService,
    accessControlService: AccessControlService,
    principalAuthorizationService: PrincipalAuthorizationService,
    resourceScopeService: ResourceScopeService,
    auditService: AuditService,
    idempotencyService: IdempotencyService,
    configService: ConfigService,
  ) {
    super(
      projectModel,
      projectDocumentationModel,
      projectDocumentPageModel,
      projectDocumentPageVersionModel,
      projectContextSnapshotModel,
      projectBacklogItemModel,
      projectSprintModel,
      projectSprintItemModel,
      projectMembershipModel,
      projectRoadmapModel,
      projectRoadmapVersionModel,
      projectRoadmapMilestoneModel,
      projectRoadmapEpicModel,
      projectRoadmapImportModel,
      crmService,
      accessControlService,
      principalAuthorizationService,
      resourceScopeService,
      auditService,
      idempotencyService,
      configService,
    );
  }
}
