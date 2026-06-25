import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type RealtimeEvent = {
  eventType: string;
  eventVersion: number;
  eventId: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  occurredAt: string;
};

@Injectable()
export class RealtimeService {
  private readonly events$ = new Subject<RealtimeEvent>();

  emit(event: RealtimeEvent) {
    this.events$.next(event);
  }

  stream(organizationId: string): Observable<{ data: RealtimeEvent }> {
    return new Observable((subscriber) => {
      const subscription = this.events$.subscribe((event) => {
        if (event.organizationId === organizationId) {
          subscriber.next({ data: event });
        }
      });
      return () => subscription.unsubscribe();
    });
  }
}
