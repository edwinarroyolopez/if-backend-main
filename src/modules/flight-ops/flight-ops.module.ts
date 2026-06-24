import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { EventsModule } from 'src/platform/events/events.module';
import { IdempotencyModule } from 'src/platform/idempotency/idempotency.module';
import { FlightOpsController } from './flight-ops.controller';
import { FlightOpsService } from './flight-ops.service';
import { Mission, MissionSchema } from './mission.schema';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    EventsModule,
    IdempotencyModule,
    MongooseModule.forFeature([{ name: Mission.name, schema: MissionSchema }]),
  ],
  controllers: [FlightOpsController],
  providers: [FlightOpsService, TransactionManagerService],
  exports: [FlightOpsService],
})
export class FlightOpsModule {}
