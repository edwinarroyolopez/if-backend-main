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
import { ProjectRoadmap, ProjectRoadmapSchema } from './project-roadmap.schema';
import { Project, ProjectSchema } from './project.schema';
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
      { name: ProjectRoadmap.name, schema: ProjectRoadmapSchema },
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, TransactionManagerService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
