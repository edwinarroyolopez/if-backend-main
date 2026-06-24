export interface DomainEventHandler {
  supports(eventType: string): boolean;
  handle(event: Record<string, unknown>): Promise<void>;
}
