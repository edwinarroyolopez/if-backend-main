import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { EventsModule } from 'src/platform/events/events.module';
import { IdempotencyModule } from 'src/platform/idempotency/idempotency.module';
import { IdentityModule } from 'src/platform/identity/identity.module';
import { ProjectsModule } from 'src/modules/projects/projects.module';
import { CloudinaryUploadService } from './cloudinary-upload.service';
import { FlightOpsController } from './flight-ops.controller';
import { FlightOpsService } from './flight-ops.service';
import { MissionMediaStoragePort } from './mission-media-storage.port';
import {
  MissionMediaAsset,
  MissionMediaAssetSchema,
} from './mission-media-asset.schema';
import { Mission, MissionSchema } from './mission.schema';
import { PilotAssignmentPolicy } from './pilot-assignment-policy.service';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    EventsModule,
    IdempotencyModule,
    IdentityModule,
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Mission.name, schema: MissionSchema },
      { name: MissionMediaAsset.name, schema: MissionMediaAssetSchema },
    ]),
  ],
  controllers: [FlightOpsController],
  providers: [
    FlightOpsService,
    CloudinaryUploadService,
    {
      provide: MissionMediaStoragePort,
      useExisting: CloudinaryUploadService,
    },
    PilotAssignmentPolicy,
    TransactionManagerService,
  ],
  exports: [FlightOpsService],
})
export class FlightOpsModule {}
