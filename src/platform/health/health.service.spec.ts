import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports readiness while MongoDB is connected', () => {
    const service = new HealthService({ readyState: 1 } as never);

    expect(service.ready()).toEqual({
      status: 'ok',
      mongodb: 'connected',
      shuttingDown: false,
    });
  });

  it('reports degraded readiness when shutting down', () => {
    const service = new HealthService({ readyState: 1 } as never);

    service.onApplicationShutdown();

    expect(service.ready()).toEqual({
      status: 'degraded',
      mongodb: 'connected',
      shuttingDown: true,
    });
  });
});
