import { Injectable, OnApplicationShutdown } from '@nestjs/common';
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
export class RealtimeService implements OnApplicationShutdown {
  private readonly events$ = new Subject<RealtimeEvent>();
  private shuttingDown = false;

  onApplicationShutdown() {
    this.shuttingDown = true;
    this.events$.complete();
  }

  emit(event: RealtimeEvent) {
    if (this.shuttingDown) {
      return;
    }
    this.events$.next(event);
  }

  stream(organizationId: string): Observable<{ data: RealtimeEvent }> {
    return new Observable((subscriber) => {
      if (this.shuttingDown) {
        subscriber.complete();
        return undefined;
      }
      const subscription = this.events$.subscribe({
        next: (event) => {
          if (event.organizationId === organizationId) {
            subscriber.next({ data: event });
          }
        },
        error: (error: unknown) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });
      return () => subscription.unsubscribe();
    });
  }
}
