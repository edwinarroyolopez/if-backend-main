import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { OutboxEventDocument } from './outbox-event.schema';
import { selectDueDelivery } from './outbox-delivery-state';

export async function findDueOutboxEvent(
  outboxModel: HydratedModel<OutboxEventDocument>,
  now: Date,
  staleProcessingThreshold: Date,
) {
  const candidates = await outboxModel
    .find({ status: { $nin: ['PUBLISHED', 'DEAD_LETTER'] } })
    .sort({ createdAt: 1 })
    .limit(200);
  return candidates.find((candidate) => {
    if (candidate.deliveries.length === 0) {
      return candidate.nextAttemptAt <= now || isStale(candidate);
    }
    return !!selectDueDelivery(
      candidate.deliveries,
      now,
      staleProcessingThreshold,
    );
  });

  function isStale(candidate: OutboxEventDocument) {
    return (
      candidate.status === 'PROCESSING' &&
      !!candidate.processingStartedAt &&
      candidate.processingStartedAt <= staleProcessingThreshold
    );
  }
}
