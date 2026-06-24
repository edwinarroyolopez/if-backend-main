import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { Deliverable, DeliverableSchema } from './deliverable.schema';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: Deliverable.name, schema: DeliverableSchema },
    ]),
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService],
})
export class DeliverablesModule {}
