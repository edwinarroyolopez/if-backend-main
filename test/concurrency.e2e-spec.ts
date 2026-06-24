import type { Response } from 'supertest';
import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Inflight backend concurrency', () => {
  it('allows only one refresh winner and audits the later replay', async () => {
    const context = await createTestContext();

    try {
      await context.http
        .post('/api/v1/auth/native/register')
        .send({
          email: 'concurrency@test.dev',
          displayName: 'Concurrency User',
          password: 'ConcurrencyPassword123!',
        })
        .expect(201);
      const nativeLogin = await context.http
        .post('/api/v1/auth/native/login')
        .send({
          email: 'concurrency@test.dev',
          password: 'ConcurrencyPassword123!',
        })
        .expect(201);

      const concurrentResults = await Promise.allSettled<Response>([
        context.http
          .post('/api/v1/auth/native/refresh')
          .send({ refreshToken: nativeLogin.body.refreshToken as string }),
        context.http
          .post('/api/v1/auth/native/refresh')
          .send({ refreshToken: nativeLogin.body.refreshToken as string }),
      ]);
      const refreshStatuses = concurrentResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.status] : [],
      );
      expect(refreshStatuses.filter((status) => status === 201)).toHaveLength(
        1,
      );
      expect(refreshStatuses.some((status) => status === 401)).toBe(true);

      const replayResponse = await context.http
        .post('/api/v1/auth/native/refresh')
        .send({ refreshToken: nativeLogin.body.refreshToken as string })
        .expect(401);
      expect(replayResponse.body.reasonCode).toBe(
        'AUTH_REFRESH_TOKEN_CONSUMED',
      );

      const replayAudits = await context.models.auditLogs.find({
        resourceId: nativeLogin.body.sessionId as string,
        reasonCode: 'AUTH_REFRESH_TOKEN_CONSUMED',
      });
      expect(replayAudits.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  it('persists a single mission event and processes it only once across two workers', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
      );

      const missionResults = await Promise.allSettled<Response>([
        context.http
          .post(`/api/v1/missions/${fixtures.missionId}/complete`)
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', 'mission-concurrency-1'),
        context.http
          .post(`/api/v1/missions/${fixtures.missionId}/complete`)
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', 'mission-concurrency-2'),
      ]);
      const missionStatuses = missionResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.status] : [],
      );
      expect(
        missionStatuses.some((status) => status === 201 || status === 200),
      ).toBe(true);

      const outboxEvents = await context.models.outbox.find({
        aggregateId: fixtures.missionId,
      });
      expect(outboxEvents).toHaveLength(1);

      const workerResults = await Promise.all([
        context.drainOutboxOnce(),
        context.drainOutboxOnce(),
      ]);
      expect(workerResults.sort()).toEqual([0, 1]);

      const storedEvent = await context.models.outbox.findOne({
        aggregateId: fixtures.missionId,
      });
      expect(storedEvent?.status).toBe('PUBLISHED');

      const mediaBatches = await context.models.mediaBatches.find({
        missionId: fixtures.missionId,
      });
      expect(mediaBatches).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
});
