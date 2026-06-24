import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './outbox-event.schema';
import { DomainEventHandler } from './domain-event-handler';

const OUTBOX_MAX_ATTEMPTS = 5;
const OUTBOX_PROCESSING_LEASE_MS = 30_000;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout;
  private readonly handlers: DomainEventHandler[] = [];

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
    private readonly configService: ConfigService,
  ) {}

  registerHandler(handler: DomainEventHandler) {
    this.handlers.push(handler);
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
    const claimed = await this.outboxModel.findOneAndUpdate(
      {
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
      {
        $set: { status: 'PROCESSING', processingStartedAt: now },
        $inc: { attemptCount: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    );

    if (!claimed) {
      return 0;
    }

    try {
      const handler = this.handlers.find((candidate) =>
        candidate.supports(claimed.eventType),
      );
      if (!handler) {
        await this.outboxModel.updateOne(
          { _id: claimed.id },
          {
            $set: {
              status: 'DEAD_LETTER',
              lastError: `NO_HANDLER:${claimed.eventType}`,
              processingStartedAt: undefined,
            },
          },
        );
        return 1;
      }

      await handler.handle(claimed.payload);

      await this.outboxModel.updateOne(
        { _id: claimed.id },
        {
          $set: {
            status: 'PUBLISHED',
            lastError: undefined,
            processingStartedAt: undefined,
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown outbox publish error';
      const nextDelayMs =
        Math.min(2 ** Math.max(claimed.attemptCount - 1, 0), 60) * 1000;
      const nextAttemptAt = new Date(Date.now() + nextDelayMs);
      await this.outboxModel.updateOne(
        { _id: claimed.id },
        {
          $set: {
            status:
              claimed.attemptCount >= OUTBOX_MAX_ATTEMPTS
                ? 'DEAD_LETTER'
                : 'FAILED',
            lastError: message,
            nextAttemptAt,
            processingStartedAt: undefined,
          },
        },
      );
    }

    return 1;
  }
}
