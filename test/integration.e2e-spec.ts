import { createOperationalFixtures, createTestContext, registerAndBootstrapOrganization } from './app-test-context';

describe('Inflight backend integration', () => {
  it('enforces unique email and writes audit/outbox/media batch on mission completion', async () => {
    const context = await createTestContext();

    try {
      const first = await context.http.post('/api/v1/auth/native/register').send({
        email: 'duplicate@test.dev',
        displayName: 'First User',
        password: 'DuplicatePassword123!',
      }).expect(201);
      expect(first.body.user.email).toBe('duplicate@test.dev');

      await context.http.post('/api/v1/auth/native/register').send({
        email: 'duplicate@test.dev',
        displayName: 'Second User',
        password: 'DuplicatePassword123!',
      }).expect(409);

      const { ownerAccessToken, organizationId } = await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(context, ownerAccessToken, organizationId);

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/complete`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'mission-complete-integration')
        .expect(201);

      const outboxEvents = await context.models.outbox.find({ aggregateId: fixtures.missionId });
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0].eventType).toBe('MissionCompleted.v1');

      const auditEvents = await context.models.auditLogs.find({ resourceId: fixtures.missionId });
      expect(auditEvents.some((event) => event.action === 'flight.mission.complete')).toBe(true);

      const mediaBatches = await context.models.mediaBatches.find({ missionId: fixtures.missionId });
      expect(mediaBatches).toHaveLength(1);
      expect(mediaBatches[0].status).toBe('PENDING_INGEST');
    } finally {
      await context.close();
    }
  });
});
