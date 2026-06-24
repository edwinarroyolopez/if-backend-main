import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './outbox-event.schema';
import { DomainEventHandler } from './domain-event-handler';

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
    const claimed = await this.outboxModel.findOneAndUpdate(
      {
        status: { $in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { $lte: now },
      },
      {
        $set: { status: 'PROCESSING' },
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
      if (handler) {
        await handler.handle(claimed.payload);
      }

      await this.outboxModel.updateOne(
        { _id: claimed.id },
        {
          $set: {
            status: 'PUBLISHED',
            lastError: undefined,
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown outbox publish error';
      const nextAttemptAt = new Date(
        Date.now() + Math.min(claimed.attemptCount, 5) * 1000,
      );
      await this.outboxModel.updateOne(
        { _id: claimed.id },
        {
          $set: {
            status: claimed.attemptCount >= 5 ? 'DEAD_LETTER' : 'FAILED',
            lastError: message,
            nextAttemptAt,
          },
        },
      );
    }

    return 1;
  }
}
