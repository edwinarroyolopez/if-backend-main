import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from 'src/modules/projects/projects.module';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { Deliverable, DeliverableSchema } from './deliverable.schema';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Deliverable.name, schema: DeliverableSchema },
    ]),
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService, TransactionManagerService],
})
export class DeliverablesModule {}
