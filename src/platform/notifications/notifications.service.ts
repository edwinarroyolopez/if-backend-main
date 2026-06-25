import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { Notification, NotificationDocument } from './notification.schema';

export type NotificationInput = {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  eventId: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createOnce(input: NotificationInput) {
    await this.notificationModel.updateOne(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        eventId: input.eventId,
      },
      { $setOnInsert: input },
      { upsert: true },
    );
  }

  async listOwn(input: {
    organizationId: string;
    userId: string;
    unreadOnly?: boolean;
  }) {
    const query: Record<string, unknown> = {
      organizationId: input.organizationId,
      userId: input.userId,
    };
    if (input.unreadOnly) {
      query.readAt = { $exists: false };
    }
    const notifications = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(50);
    return notifications.map(toNotificationDto);
  }

  async markRead(input: {
    organizationId: string;
    userId: string;
    notificationId: string;
  }) {
    const notification = await this.notificationModel.findOneAndUpdate(
      {
        _id: input.notificationId,
        organizationId: input.organizationId,
        userId: input.userId,
      },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!notification) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Notification was not found',
      );
    }
    return toNotificationDto(notification);
  }

  async markAllRead(input: { organizationId: string; userId: string }) {
    await this.notificationModel.updateMany(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        readAt: { $exists: false },
      },
      { $set: { readAt: new Date() } },
    );
    return { ok: true };
  }
}

function toNotificationDto(notification: NotificationDocument) {
  return {
    id: notification.id,
    organizationId: notification.organizationId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    resourceType: notification.resourceType,
    resourceId: notification.resourceId,
    eventId: notification.eventId,
    readAt: notification.readAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}
