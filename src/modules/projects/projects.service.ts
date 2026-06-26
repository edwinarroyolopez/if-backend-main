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
import { ProjectsLegacyOperations } from './projects-legacy';

export * from './projects-legacy';

type LegacyMethod = (...args: unknown[]) => unknown;

function bindLegacyOperations(
  target: ProjectsService,
  source: ProjectsLegacyOperations,
) {
  let prototype = Object.getPrototypeOf(source) as object | null;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor' || Reflect.get(target, name) !== undefined) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const method = descriptor?.value as LegacyMethod | undefined;
      if (typeof method === 'function') {
        Object.defineProperty(target, name, {
          configurable: true,
          enumerable: false,
          value: method.bind(source),
        });
      }
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
}

@Injectable()
export class ProjectsService {
  activateProjectMembership!: ProjectsLegacyOperations['activateProjectMembership'];
  activateProjectRoadmapForRequest!: ProjectsLegacyOperations['activateProjectRoadmapForRequest'];
  addProjectSprintItemsForRequest!: ProjectsLegacyOperations['addProjectSprintItemsForRequest'];
  approveProjectDocumentPageForRequest!: ProjectsLegacyOperations['approveProjectDocumentPageForRequest'];
  archiveProjectBacklogItem!: ProjectsLegacyOperations['archiveProjectBacklogItem'];
  archiveProjectDocumentPage!: ProjectsLegacyOperations['archiveProjectDocumentPage'];
  archiveProjectRoadmapForRequest!: ProjectsLegacyOperations['archiveProjectRoadmapForRequest'];
  buildDocumentationInterviewPrompt!: ProjectsLegacyOperations['buildDocumentationInterviewPrompt'];
  buildRoadmapPrompt!: ProjectsLegacyOperations['buildRoadmapPrompt'];
  cancelProjectSprintForRequest!: ProjectsLegacyOperations['cancelProjectSprintForRequest'];
  commitBacklogImportFromRoadmapForRequest!: ProjectsLegacyOperations['commitBacklogImportFromRoadmapForRequest'];
  commitProjectDocumentImportForRequest!: ProjectsLegacyOperations['commitProjectDocumentImportForRequest'];
  commitProjectRoadmapImportForRequest!: ProjectsLegacyOperations['commitProjectRoadmapImportForRequest'];
  completeProjectSprintForRequest!: ProjectsLegacyOperations['completeProjectSprintForRequest'];
  createProject!: ProjectsLegacyOperations['createProject'];
  createProjectBacklogItemForRequest!: ProjectsLegacyOperations['createProjectBacklogItemForRequest'];
  createProjectContextSnapshotForRequest!: ProjectsLegacyOperations['createProjectContextSnapshotForRequest'];
  createProjectDocumentPageForRequest!: ProjectsLegacyOperations['createProjectDocumentPageForRequest'];
  createProjectForRequest!: ProjectsLegacyOperations['createProjectForRequest'];
  createProjectMembershipForRequest!: ProjectsLegacyOperations['createProjectMembershipForRequest'];
  createProjectSprintForRequest!: ProjectsLegacyOperations['createProjectSprintForRequest'];
  deactivateProjectMembership!: ProjectsLegacyOperations['deactivateProjectMembership'];
  findById!: ProjectsLegacyOperations['findById'];
  getProjectContextSnapshot!: ProjectsLegacyOperations['getProjectContextSnapshot'];
  getProjectDocumentPage!: ProjectsLegacyOperations['getProjectDocumentPage'];
  getProjectDocumentation!: ProjectsLegacyOperations['getProjectDocumentation'];
  getProjectReadiness!: ProjectsLegacyOperations['getProjectReadiness'];
  getProjectRoadmap!: ProjectsLegacyOperations['getProjectRoadmap'];
  getProjectSprint!: ProjectsLegacyOperations['getProjectSprint'];
  getVersionedProjectRoadmap!: ProjectsLegacyOperations['getVersionedProjectRoadmap'];
  listAccessibleProjectIds!: ProjectsLegacyOperations['listAccessibleProjectIds'];
  listProjectActivity!: ProjectsLegacyOperations['listProjectActivity'];
  listProjectBacklogItems!: ProjectsLegacyOperations['listProjectBacklogItems'];
  listProjectContextSnapshots!: ProjectsLegacyOperations['listProjectContextSnapshots'];
  listProjectDocumentPages!: ProjectsLegacyOperations['listProjectDocumentPages'];
  listProjectRoadmaps!: ProjectsLegacyOperations['listProjectRoadmaps'];
  listProjects!: ProjectsLegacyOperations['listProjects'];
  listProjectSprints!: ProjectsLegacyOperations['listProjectSprints'];
  listProjectTeam!: ProjectsLegacyOperations['listProjectTeam'];
  moveProjectSprintItem!: ProjectsLegacyOperations['moveProjectSprintItem'];
  onModuleInit!: ProjectsLegacyOperations['onModuleInit'];
  previewBacklogImportFromRoadmap!: ProjectsLegacyOperations['previewBacklogImportFromRoadmap'];
  previewProjectDocumentImport!: ProjectsLegacyOperations['previewProjectDocumentImport'];
  previewProjectRoadmapImport!: ProjectsLegacyOperations['previewProjectRoadmapImport'];
  reconcileLegacyProjectAccessPolicies!: ProjectsLegacyOperations['reconcileLegacyProjectAccessPolicies'];
  removeProjectSprintItemForRequest!: ProjectsLegacyOperations['removeProjectSprintItemForRequest'];
  reorderProjectBacklogItemsForRequest!: ProjectsLegacyOperations['reorderProjectBacklogItemsForRequest'];
  reorderProjectDocumentPagesForRequest!: ProjectsLegacyOperations['reorderProjectDocumentPagesForRequest'];
  resolve!: ProjectsLegacyOperations['resolve'];
  startProjectSprintForRequest!: ProjectsLegacyOperations['startProjectSprintForRequest'];
  submitProjectDocumentPageReview!: ProjectsLegacyOperations['submitProjectDocumentPageReview'];
  supports!: ProjectsLegacyOperations['supports'];
  toReadModel!: ProjectsLegacyOperations['toReadModel'];
  transitionProject!: ProjectsLegacyOperations['transitionProject'];
  updateProjectAccessRoles!: ProjectsLegacyOperations['updateProjectAccessRoles'];
  updateProjectBacklogItem!: ProjectsLegacyOperations['updateProjectBacklogItem'];
  updateProjectDetails!: ProjectsLegacyOperations['updateProjectDetails'];
  updateProjectDocumentPage!: ProjectsLegacyOperations['updateProjectDocumentPage'];
  updateProjectDocumentation!: ProjectsLegacyOperations['updateProjectDocumentation'];
  updateProjectHealth!: ProjectsLegacyOperations['updateProjectHealth'];
  updateProjectMembership!: ProjectsLegacyOperations['updateProjectMembership'];
  updateProjectRoadmap!: ProjectsLegacyOperations['updateProjectRoadmap'];

  private readonly operations: ProjectsLegacyOperations;

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
    this.operations = new ProjectsLegacyOperations(
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
    bindLegacyOperations(this, this.operations);
  }
}
