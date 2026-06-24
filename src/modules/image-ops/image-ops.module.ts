import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { EventsModule } from 'src/platform/events/events.module';
import { ImageOpsController } from './image-ops.controller';
import { ImageOpsMissionCompletedHandler } from './image-ops.event-handler';
import { ImageOpsService } from './image-ops.service';
import { MediaBatch, MediaBatchSchema } from './media-batch.schema';
import { Sample, SampleSchema } from './sample.schema';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    EventsModule,
    MongooseModule.forFeature([
      { name: MediaBatch.name, schema: MediaBatchSchema },
      { name: Sample.name, schema: SampleSchema },
    ]),
  ],
  controllers: [ImageOpsController],
  providers: [
    ImageOpsService,
    ImageOpsMissionCompletedHandler,
    TransactionManagerService,
  ],
  exports: [ImageOpsService],
})
export class ImageOpsModule {}
