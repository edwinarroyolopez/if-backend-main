export interface DomainEventHandler {
  consumerName: string;
  supports(eventType: string): boolean;
  handle(event: Record<string, unknown>): Promise<void>;
}
