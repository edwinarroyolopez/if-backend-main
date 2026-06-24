import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from 'src/modules/crm/crm.module';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { Project, ProjectSchema } from './project.schema';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    CrmModule,
    MongooseModule.forFeature([{ name: Project.name, schema: ProjectSchema }]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, TransactionManagerService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
