import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEventHandler } from 'src/platform/events/domain-event-handler';
import { OutboxRelayService } from 'src/platform/events/outbox-relay.service';
import { ImageOpsService } from './image-ops.service';

@Injectable()
export class ImageOpsMissionCompletedHandler
  implements DomainEventHandler, OnModuleInit
{
  readonly consumerName = 'image-ops.mission-completed';

  constructor(
    private readonly outboxRelayService: OutboxRelayService,
    private readonly imageOpsService: ImageOpsService,
  ) {
    this.outboxRelayService.registerHandler(this);
  }

  onModuleInit() {
    this.outboxRelayService.registerHandler(this);
  }

  supports(eventType: string): boolean {
    return eventType === 'MissionPilotCompleted.v1';
  }

  async handle(event: Record<string, unknown>): Promise<void> {
    await this.imageOpsService.handleMissionCompletedEvent({
      organizationId: String(event.organizationId),
      projectId: String(event.projectId),
      missionId: String(event.missionId),
      completedBy: String(event.actorId),
    });
  }
}
