import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { CrmModule } from 'src/modules/crm/crm.module';
import { ProjectsModule } from 'src/modules/projects/projects.module';
import { Opportunity, OpportunitySchema } from './opportunity.schema';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    CrmModule,
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Opportunity.name, schema: OpportunitySchema },
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService, TransactionManagerService],
})
export class SalesModule {}
