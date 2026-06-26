import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { OutboxStatus } from 'src/common/types/domain.types';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import {
  OutboxDeliveryState,
  OutboxEvent,
  OutboxEventDocument,
} from './outbox-event.schema';
import { DomainEventHandler } from './domain-event-handler';
import {
  EXPECTED_CONSUMERS_BY_EVENT_TYPE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_PROCESSING_LEASE_MS,
  aggregateDeliveryStatus,
  aggregateLastError,
  aggregateNextAttemptAt,
  selectDueDelivery,
} from './outbox-delivery-state';
import { findDueOutboxEvent } from './outbox-relay-queries';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private static readonly registeredHandlers: DomainEventHandler[] = [];
  private interval?: NodeJS.Timeout;

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: HydratedModel<OutboxEventDocument>,
    private readonly configService: ConfigService,
  ) {}

  registerHandler(handler: DomainEventHandler) {
    const existingIndex = OutboxRelayService.registeredHandlers.findIndex(
      (candidate) => candidate.consumerName === handler.consumerName,
    );
    if (existingIndex === -1) {
      OutboxRelayService.registeredHandlers.push(handler);
      return;
    }
    OutboxRelayService.registeredHandlers[existingIndex] = handler;
  }

  onModuleInit() {
    if (this.configService.getOrThrow<string>('app.nodeEnv') === 'test') {
      return;
    }
    this.interval = setInterval(() => {
      void this.drainOnce();
    }, 1000);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  async drainOnce(): Promise<number> {
    const now = new Date();
    const staleProcessingThreshold = new Date(
      now.getTime() - OUTBOX_PROCESSING_LEASE_MS,
    );
    const event = await findDueOutboxEvent(
      this.outboxModel,
      now,
      staleProcessingThreshold,
    );
    if (!event) {
      return 0;
    }

    const handlers = OutboxRelayService.registeredHandlers.filter((candidate) =>
      candidate.supports(event.eventType),
    );
    if (handlers.length === 0) {
      await this.markEventDeadLetter(event, `NO_HANDLER:${event.eventType}`);
      return 1;
    }

    const reconciled = await this.reconcileDeliveries(event, handlers, now);
    const dueDelivery = selectDueDelivery(
      reconciled.deliveries,
      now,
      staleProcessingThreshold,
    );
    if (!dueDelivery) {
      await this.refreshAggregateStatus(reconciled.id);
      return 0;
    }

    const handler = handlers.find(
      (candidate) => candidate.consumerName === dueDelivery.consumerName,
    );
    if (!handler) {
      await this.markDeliveryFailed(
        reconciled.id,
        dueDelivery,
        'HANDLER_REMOVED',
      );
      return 1;
    }

    const leaseToken = randomUUID();
    const claimed = await this.claimDelivery(
      reconciled.id,
      dueDelivery,
      now,
      staleProcessingThreshold,
      leaseToken,
    );
    if (!claimed) {
      return 0;
    }

    try {
      await handler.handle(reconciled.payload);
      await this.markDeliveryPublished(
        reconciled.id,
        dueDelivery.consumerName,
        leaseToken,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown outbox publish error';
      await this.markDeliveryFailed(reconciled.id, claimed, message);
    }

    await this.refreshAggregateStatus(reconciled.id);

    return 1 + (await this.drainOnce());
  }

  private async reconcileDeliveries(
    event: OutboxEventDocument,
    handlers: DomainEventHandler[],
    now: Date,
  ) {
    const existing = new Set(event.deliveries.map((item) => item.consumerName));
    const missing = handlers
      .filter((handler) => !existing.has(handler.consumerName))
      .map((handler) => ({
        consumerName: handler.consumerName,
        status: 'PENDING' satisfies OutboxStatus,
        attemptCount: 0,
        nextAttemptAt: now,
      }));
    if (missing.length === 0) {
      return event;
    }
    await this.outboxModel.updateOne(
      { _id: event.id },
      {
        $push: { deliveries: { $each: missing } },
        $set: { status: 'PENDING', nextAttemptAt: now },
      },
    );
    return this.outboxModel.findById(event.id).orFail();
  }

  private async claimDelivery(
    eventId: string,
    delivery: OutboxDeliveryState,
    now: Date,
    staleProcessingThreshold: Date,
    leaseToken: string,
  ): Promise<OutboxDeliveryState | undefined> {
    const result = await this.outboxModel.updateOne(
      {
        _id: eventId,
        deliveries: {
          $elemMatch: {
            consumerName: delivery.consumerName,
            $or: [
              {
                status: { $in: ['PENDING', 'FAILED'] },
                nextAttemptAt: { $lte: now },
              },
              {
                status: 'PROCESSING',
                processingStartedAt: { $lte: staleProcessingThreshold },
              },
            ],
          },
        },
      },
      {
        $set: {
          status: 'PROCESSING',
          processingStartedAt: now,
          'deliveries.$.status': 'PROCESSING',
          'deliveries.$.processingStartedAt': now,
          'deliveries.$.leaseToken': leaseToken,
        },
        $inc: { attemptCount: 1, 'deliveries.$.attemptCount': 1 },
      },
    );
    if (result.modifiedCount !== 1) {
      return undefined;
    }
    return { ...delivery, attemptCount: delivery.attemptCount + 1, leaseToken };
  }

  private async markDeliveryPublished(
    eventId: string,
    consumerName: string,
    leaseToken: string,
  ) {
    await this.outboxModel.updateOne(
      {
        _id: eventId,
        deliveries: { $elemMatch: { consumerName, leaseToken } },
      },
      {
        $set: {
          'deliveries.$.status': 'PUBLISHED',
          'deliveries.$.lastError': undefined,
          'deliveries.$.processingStartedAt': undefined,
          'deliveries.$.leaseToken': undefined,
        },
      },
    );
  }

  private async markDeliveryFailed(
    eventId: string,
    delivery: OutboxDeliveryState,
    message: string,
  ) {
    const nextDelayMs =
      Math.min(2 ** Math.max(delivery.attemptCount - 1, 0), 60) * 1000;
    const nextAttemptAt = new Date(Date.now() + nextDelayMs);
    await this.outboxModel.updateOne(
      { _id: eventId, 'deliveries.consumerName': delivery.consumerName },
      {
        $set: {
          'deliveries.$.status':
            delivery.attemptCount >= OUTBOX_MAX_ATTEMPTS
              ? 'DEAD_LETTER'
              : 'FAILED',
          'deliveries.$.lastError': message,
          'deliveries.$.nextAttemptAt': nextAttemptAt,
          'deliveries.$.processingStartedAt': undefined,
          'deliveries.$.leaseToken': undefined,
        },
      },
    );
  }

  private async markEventDeadLetter(
    event: OutboxEventDocument,
    message: string,
  ) {
    await this.outboxModel.updateOne(
      { _id: event.id },
      {
        $set: {
          status: 'DEAD_LETTER',
          lastError: message,
          processingStartedAt: undefined,
        },
      },
    );
  }

  private async refreshAggregateStatus(eventId: string) {
    const event = await this.outboxModel.findById(eventId);
    if (!event) return;
    const expectedConsumers = EXPECTED_CONSUMERS_BY_EVENT_TYPE.get(
      event.eventType,
    );
    const status = aggregateDeliveryStatus(event.deliveries, expectedConsumers);
    await this.outboxModel.updateOne(
      { _id: eventId },
      {
        $set: {
          status,
          lastError: aggregateLastError(event.deliveries),
          nextAttemptAt: aggregateNextAttemptAt(event.deliveries),
          processingStartedAt: undefined,
        },
      },
    );
  }
}
