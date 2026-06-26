import { OutboxDeliveryState } from './outbox-event.schema';

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_PROCESSING_LEASE_MS = 30_000;
export const EXPECTED_CONSUMERS_BY_EVENT_TYPE = new Map<string, string[]>([
  [
    'MissionPilotCompleted.v1',
    ['image-ops.mission-completed', 'notifications.mission'],
  ],
]);

export function selectDueDelivery(
  deliveries: OutboxDeliveryState[],
  now: Date,
  staleProcessingThreshold: Date,
) {
  return deliveries.find((delivery) => {
    if (
      ['PENDING', 'FAILED'].includes(delivery.status) &&
      delivery.nextAttemptAt <= now
    ) {
      return true;
    }
    return (
      delivery.status === 'PROCESSING' &&
      !!delivery.processingStartedAt &&
      delivery.processingStartedAt <= staleProcessingThreshold
    );
  });
}

export function aggregateDeliveryStatus(
  deliveries: OutboxDeliveryState[],
  expectedConsumers?: string[],
) {
  if (deliveries.length === 0) return 'DEAD_LETTER';
  if (
    expectedConsumers?.some(
      (consumerName) =>
        !deliveries.some((delivery) => delivery.consumerName === consumerName),
    )
  ) {
    return 'PENDING';
  }
  if (deliveries.every((delivery) => delivery.status === 'PUBLISHED')) {
    return 'PUBLISHED';
  }
  if (deliveries.some((delivery) => delivery.status === 'PROCESSING')) {
    return 'PROCESSING';
  }
  if (deliveries.some((delivery) => delivery.status === 'PENDING')) {
    return 'PENDING';
  }
  if (deliveries.some((delivery) => delivery.status === 'FAILED')) {
    return 'FAILED';
  }
  return 'DEAD_LETTER';
}

export function aggregateLastError(deliveries: OutboxDeliveryState[]) {
  return deliveries.find((delivery) => delivery.lastError)?.lastError;
}

export function aggregateNextAttemptAt(deliveries: OutboxDeliveryState[]) {
  const retryable = deliveries.filter((delivery) =>
    ['PENDING', 'FAILED'].includes(delivery.status),
  );
  if (retryable.length === 0) return new Date();
  return retryable.reduce(
    (earliest, delivery) =>
      delivery.nextAttemptAt < earliest ? delivery.nextAttemptAt : earliest,
    retryable[0].nextAttemptAt,
  );
}
