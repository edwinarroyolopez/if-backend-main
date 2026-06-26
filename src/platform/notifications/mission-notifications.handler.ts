import { Injectable, OnModuleInit } from '@nestjs/common';
import { IdentityService } from 'src/platform/identity/identity.service';
import { DomainEventHandler } from 'src/platform/events/domain-event-handler';
import { OutboxRelayService } from 'src/platform/events/outbox-relay.service';
import { RealtimeService } from 'src/platform/realtime/realtime.service';
import { NotificationsService } from './notifications.service';

const MISSION_EVENTS = new Set([
  'MissionRequested.v1',
  'MissionAssigned.v1',
  'MissionReassigned.v1',
  'MissionAccepted.v1',
  'MissionRejected.v1',
  'MissionStarted.v1',
  'MissionMediaUploaded.v1',
  'MissionPilotCompleted.v1',
  'MissionReviewedClosed.v1',
  'MissionCancelled.v1',
  'MissionFailed.v1',
]);

@Injectable()
export class MissionNotificationsHandler
  implements DomainEventHandler, OnModuleInit
{
  readonly consumerName = 'notifications.mission';

  constructor(
    private readonly outboxRelayService: OutboxRelayService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
    private readonly identityService: IdentityService,
  ) {
    this.outboxRelayService.registerHandler(this);
  }

  onModuleInit() {
    this.outboxRelayService.registerHandler(this);
  }

  supports(eventType: string): boolean {
    return MISSION_EVENTS.has(eventType);
  }

  async handle(event: Record<string, unknown>): Promise<void> {
    const eventType =
      typeof event.eventType === 'string' ? event.eventType : 'mission.updated';
    const eventId = typeof event.eventId === 'string' ? event.eventId : '';
    const organizationId =
      typeof event.organizationId === 'string' ? event.organizationId : '';
    const missionId =
      typeof event.missionId === 'string' ? event.missionId : '';
    const occurredAt =
      typeof event.occurredAt === 'string'
        ? event.occurredAt
        : new Date().toISOString();

    this.realtimeService.emit({
      eventType: 'mission.updated',
      eventVersion: 1,
      eventId,
      organizationId,
      resourceType: 'MISSION',
      resourceId: missionId,
      reason: eventType,
      occurredAt,
    });

    const recipients = await this.resolveRecipients(eventType, event);
    await Promise.all(
      recipients.map((userId) =>
        this.notificationsService.createOnce({
          organizationId,
          userId,
          type: eventType,
          title: this.titleFor(eventType),
          body: this.bodyFor(eventType),
          resourceType: 'MISSION',
          resourceId: missionId,
          eventId,
        }),
      ),
    );
  }

  private async resolveRecipients(
    eventType: string,
    event: Record<string, unknown>,
  ) {
    const recipients = new Set<string>();
    const assignedPilotId = optionalString(event.assignedPilotId);
    const previousPilotId = optionalString(event.previousPilotId);
    const previousAssignmentStatus = optionalString(
      event.previousAssignmentStatus,
    );
    const createdBy = optionalString(event.createdBy);
    const assignedBy = optionalString(event.assignedBy);

    if (
      [
        'MissionRequested.v1',
        'MissionAssigned.v1',
        'MissionCancelled.v1',
      ].includes(eventType) &&
      assignedPilotId
    ) {
      recipients.add(assignedPilotId);
    }
    if (eventType === 'MissionReviewedClosed.v1' && assignedPilotId) {
      recipients.add(assignedPilotId);
    }
    if (eventType === 'MissionReassigned.v1') {
      if (assignedPilotId) {
        recipients.add(assignedPilotId);
      }
      if (
        previousPilotId &&
        ['ASSIGNED', 'ACCEPTED'].includes(previousAssignmentStatus ?? '')
      ) {
        recipients.add(previousPilotId);
      }
    }
    if (
      [
        'MissionAccepted.v1',
        'MissionRejected.v1',
        'MissionStarted.v1',
        'MissionMediaUploaded.v1',
        'MissionPilotCompleted.v1',
      ].includes(eventType)
    ) {
      if (createdBy && (await this.isActiveUser(createdBy))) {
        recipients.add(createdBy);
      }
      if (
        assignedBy &&
        assignedBy !== createdBy &&
        (await this.isActiveUser(assignedBy))
      ) {
        recipients.add(assignedBy);
      }
    }

    return [...recipients];
  }

  private async isActiveUser(userId: string) {
    const user = await this.identityService.findUserById(userId);
    return user?.status === 'ACTIVE';
  }

  private titleFor(eventType: string) {
    return eventType.replace('.v1', '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  private bodyFor(eventType: string) {
    return `Mission update: ${this.titleFor(eventType)}`;
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
