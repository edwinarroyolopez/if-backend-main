import { RealtimeEvent, RealtimeService } from './realtime.service';

const event: RealtimeEvent = {
  eventType: 'MissionUpdated.v1',
  eventVersion: 1,
  eventId: 'event-1',
  organizationId: 'org-a',
  resourceType: 'MISSION',
  resourceId: 'mission-1',
  reason: 'test',
  occurredAt: new Date(0).toISOString(),
};

describe('RealtimeService', () => {
  it('streams only events for the requested organization', () => {
    const service = new RealtimeService();
    const received: RealtimeEvent[] = [];
    const subscription = service.stream('org-a').subscribe((message) => {
      received.push(message.data);
    });

    service.emit({ ...event, organizationId: 'org-b' });
    service.emit(event);

    expect(received).toEqual([event]);
    subscription.unsubscribe();
  });

  it('completes streams during application shutdown', () => {
    const service = new RealtimeService();
    let completed = false;
    service.stream('org-a').subscribe({ complete: () => (completed = true) });

    service.onApplicationShutdown();

    expect(completed).toBe(true);
  });
});
