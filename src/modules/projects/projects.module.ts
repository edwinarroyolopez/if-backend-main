import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from 'src/modules/crm/crm.module';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdempotencyModule } from 'src/platform/idempotency/idempotency.module';
import {
  ProjectDocumentation,
  ProjectDocumentationSchema,
} from './project-documentation.schema';
import {
  ProjectDocumentPage,
  ProjectDocumentPageSchema,
} from './project-document-page.schema';
import {
  ProjectDocumentPageVersion,
  ProjectDocumentPageVersionSchema,
} from './project-document-page-version.schema';
import {
  ProjectContextSnapshot,
  ProjectContextSnapshotSchema,
} from './project-context-snapshot.schema';
import {
  ProjectBacklogItem,
  ProjectBacklogItemSchema,
} from './project-backlog-item.schema';
import {
  ProjectMembership,
  ProjectMembershipSchema,
} from './project-membership.schema';
import {
  ProjectSprintItem,
  ProjectSprintItemSchema,
} from './project-sprint-item.schema';
import { ProjectSprint, ProjectSprintSchema } from './project-sprint.schema';
import {
  ProjectRoadmapEpic,
  ProjectRoadmapEpicSchema,
} from './project-roadmap-epic.schema';
import {
  ProjectRoadmapImport,
  ProjectRoadmapImportSchema,
} from './project-roadmap-import.schema';
import {
  ProjectRoadmapMilestone,
  ProjectRoadmapMilestoneSchema,
} from './project-roadmap-milestone.schema';
import {
  ProjectRoadmapVersion,
  ProjectRoadmapVersionSchema,
} from './project-roadmap-version.schema';
import { ProjectRoadmap, ProjectRoadmapSchema } from './project-roadmap.schema';
import { Project, ProjectSchema } from './project.schema';
import { ProjectActivityController } from './project-activity.controller';
import { ProjectAccessRolesController } from './project-access-roles.controller';
import { ProjectBacklogController } from './project-backlog.controller';
import { ProjectBacklogImportsController } from './project-backlog-imports.controller';
import { ProjectContextSnapshotsController } from './project-context-snapshots.controller';
import { ProjectDocumentImportsController } from './project-document-imports.controller';
import { ProjectDocumentPageReviewController } from './project-document-page-review.controller';
import { ProjectDocumentPagesController } from './project-document-pages.controller';
import { ProjectDocumentationController } from './project-documentation.controller';
import { ProjectRoadmapController } from './project-roadmap.controller';
import { ProjectRoadmapImportsController } from './project-roadmap-imports.controller';
import { ProjectRoadmapsController } from './project-roadmaps.controller';
import { ProjectSprintActionsController } from './project-sprint-actions.controller';
import { ProjectSprintsController } from './project-sprints.controller';
import { ProjectTeamController } from './project-team.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    CrmModule,
    IdempotencyModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectDocumentation.name, schema: ProjectDocumentationSchema },
      { name: ProjectDocumentPage.name, schema: ProjectDocumentPageSchema },
      {
        name: ProjectDocumentPageVersion.name,
        schema: ProjectDocumentPageVersionSchema,
      },
      {
        name: ProjectContextSnapshot.name,
        schema: ProjectContextSnapshotSchema,
      },
      { name: ProjectBacklogItem.name, schema: ProjectBacklogItemSchema },
      { name: ProjectMembership.name, schema: ProjectMembershipSchema },
      { name: ProjectSprint.name, schema: ProjectSprintSchema },
      { name: ProjectSprintItem.name, schema: ProjectSprintItemSchema },
      { name: ProjectRoadmap.name, schema: ProjectRoadmapSchema },
      { name: ProjectRoadmapVersion.name, schema: ProjectRoadmapVersionSchema },
      {
        name: ProjectRoadmapMilestone.name,
        schema: ProjectRoadmapMilestoneSchema,
      },
      { name: ProjectRoadmapEpic.name, schema: ProjectRoadmapEpicSchema },
      { name: ProjectRoadmapImport.name, schema: ProjectRoadmapImportSchema },
    ]),
  ],
  controllers: [
    ProjectsController,
    ProjectAccessRolesController,
    ProjectContextSnapshotsController,
    ProjectDocumentImportsController,
    ProjectDocumentPagesController,
    ProjectDocumentPageReviewController,
    ProjectDocumentationController,
    ProjectRoadmapController,
    ProjectRoadmapImportsController,
    ProjectRoadmapsController,
    ProjectBacklogImportsController,
    ProjectBacklogController,
    ProjectTeamController,
    ProjectActivityController,
    ProjectSprintsController,
    ProjectSprintActionsController,
  ],
  providers: [ProjectsService, TransactionManagerService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
