import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from 'src/platform/events/events.module';
import { IdentityModule } from 'src/platform/identity/identity.module';
import { RealtimeModule } from 'src/platform/realtime/realtime.module';
import { MissionNotificationsHandler } from './mission-notifications.handler';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [
    EventsModule,
    IdentityModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, MissionNotificationsHandler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
