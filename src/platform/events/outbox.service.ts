import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './outbox-event.schema';

export type DomainEventInput = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
};

@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
  ) {}

  async append(event: DomainEventInput, session: ClientSession) {
    await this.outboxModel.create(
      [
        {
          ...event,
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: new Date(),
        },
      ],
      { session },
    );
  }
}
