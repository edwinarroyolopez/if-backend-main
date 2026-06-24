import { createOperationalFixtures, createTestContext, registerAndBootstrapOrganization } from './app-test-context';

describe('Inflight backend concurrency', () => {
  it('allows only one refresh winner and avoids duplicate mission outbox events', async () => {
    const context = await createTestContext();

    try {
      const nativeRegister = await context.http.post('/api/v1/auth/native/register').send({
        email: 'concurrency@test.dev',
        displayName: 'Concurrency User',
        password: 'ConcurrencyPassword123!',
      }).expect(201);
      const nativeLogin = await context.http.post('/api/v1/auth/native/login').send({
        email: 'concurrency@test.dev',
        password: 'ConcurrencyPassword123!',
      }).expect(201);

      const refreshResults = await Promise.allSettled([
        context.http.post('/api/v1/auth/native/refresh').send({ refreshToken: nativeLogin.body.refreshToken }),
        context.http.post('/api/v1/auth/native/refresh').send({ refreshToken: nativeLogin.body.refreshToken }),
      ]);
      const refreshStatuses = refreshResults
        .filter((result): result is PromiseFulfilledResult<{ status: number }> => result.status === 'fulfilled')
        .map((result) => result.value.status);
      expect(refreshStatuses.filter((status) => status === 201)).toHaveLength(1);
      expect(refreshStatuses.some((status) => status === 401)).toBe(true);

      const { ownerAccessToken, organizationId } = await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(context, ownerAccessToken, organizationId);

      const missionResults = await Promise.allSettled([
        context.http
          .post(`/api/v1/missions/${fixtures.missionId}/complete`)
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', 'mission-concurrency-1'),
        context.http
          .post(`/api/v1/missions/${fixtures.missionId}/complete`)
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', 'mission-concurrency-2'),
      ]);
      const missionStatuses = missionResults
        .filter((result): result is PromiseFulfilledResult<{ status: number }> => result.status === 'fulfilled')
        .map((result) => result.value.status);
      expect(missionStatuses.some((status) => status === 201 || status === 200 || status === 409)).toBe(true);

      const outboxEvents = await context.models.outbox.find({ aggregateId: fixtures.missionId });
      expect(outboxEvents).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
});
