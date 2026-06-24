import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { InvoiceRequest, InvoiceRequestSchema } from './invoice-request.schema';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: InvoiceRequest.name, schema: InvoiceRequestSchema },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService, TransactionManagerService],
})
export class FinanceModule {}
