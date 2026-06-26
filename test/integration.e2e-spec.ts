import {
  createOperationalFixtures,
  createTestContext,
  prepareMissionForPilotCompletion,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Inflight backend integration', () => {
  it('enforces unique email and keeps mission completion asynchronous until relay drain', async () => {
    const context = await createTestContext();

    try {
      const first = await context.http
        .post('/api/v1/auth/native/register')
        .send({
          email: 'duplicate@test.dev',
          displayName: 'First User',
          password: 'DuplicatePassword123!',
        })
        .expect(201);
      expect(first.body.user.email).toBe('duplicate@test.dev');

      await context.http
        .post('/api/v1/auth/native/register')
        .send({
          email: 'duplicate@test.dev',
          displayName: 'Second User',
          password: 'DuplicatePassword123!',
        })
        .expect(409);

      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
      );
      await prepareMissionForPilotCompletion(context, {
        accessToken: ownerAccessToken,
        ownerEmail,
        missionId: fixtures.missionId,
        organizationId,
        seed: 'integration-complete',
      });

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/complete`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'mission-complete-integration')
        .expect(201);

      const outboxEvents = await context.models.outbox.find({
        aggregateId: fixtures.missionId,
        eventType: 'MissionPilotCompleted.v1',
      });
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0].eventType).toBe('MissionPilotCompleted.v1');
      expect(outboxEvents[0].status).toBe('PENDING');

      const auditEvents = await context.models.auditLogs.find({
        resourceId: fixtures.missionId,
      });
      expect(
        auditEvents.some((event) => event.action === 'flight.request.complete'),
      ).toBe(true);

      const mediaBatchesBeforeDrain = await context.models.mediaBatches.find({
        missionId: fixtures.missionId,
      });
      expect(mediaBatchesBeforeDrain).toHaveLength(0);

      await context.drainOutboxUntilIdle();

      const mediaBatchesAfterDrain = await context.models.mediaBatches.find({
        missionId: fixtures.missionId,
      });
      expect(mediaBatchesAfterDrain).toHaveLength(1);
      expect(mediaBatchesAfterDrain[0].status).toBe('PENDING_INGEST');

      const publishedOutbox = await context.models.outbox.findOne({
        aggregateId: fixtures.missionId,
        eventType: 'MissionPilotCompleted.v1',
      });
      expect(publishedOutbox?.status).toBe('PUBLISHED');
    } finally {
      await context.close();
    }
  });

  it('dead-letters events when no compatible handler exists', async () => {
    const context = await createTestContext();

    try {
      const eventId = `unhandled-${Date.now()}`;
      await context.models.outbox.create({
        eventId,
        eventType: 'UnknownEvent.v1',
        eventVersion: 1,
        aggregateType: 'TEST',
        aggregateId: 'test-aggregate',
        payload: { value: true },
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
      });

      const processed = await context.drainOutboxUntilIdle();
      expect(processed).toBeGreaterThanOrEqual(1);

      const stored = await context.models.outbox.findOne({ eventId });
      expect(stored?.status).toBe('DEAD_LETTER');
      expect(stored?.lastError).toBe('NO_HANDLER:UnknownEvent.v1');
    } finally {
      await context.close();
    }
  });

  it('reclaims stale processing events on a later worker pass', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
      );
      await prepareMissionForPilotCompletion(context, {
        accessToken: ownerAccessToken,
        ownerEmail,
        missionId: fixtures.missionId,
        organizationId,
        seed: 'integration-reclaim',
      });

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/complete`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'mission-complete-reclaim')
        .expect(201);

      await context.models.outbox.updateOne(
        {
          aggregateId: fixtures.missionId,
          eventType: 'MissionPilotCompleted.v1',
        },
        {
          $set: {
            status: 'PROCESSING',
            processingStartedAt: new Date(Date.now() - 60_000),
          },
        },
      );

      const processed = await context.drainOutboxOnce();
      expect(processed).toBe(2);

      const mediaBatches = await context.models.mediaBatches.find({
        missionId: fixtures.missionId,
      });
      expect(mediaBatches).toHaveLength(1);

      const stored = await context.models.outbox.findOne({
        aggregateId: fixtures.missionId,
        eventType: 'MissionPilotCompleted.v1',
      });
      expect(stored?.status).toBe('PUBLISHED');
      expect(stored?.deliveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            consumerName: 'image-ops.mission-completed',
            status: 'PUBLISHED',
          }),
          expect.objectContaining({
            consumerName: 'notifications.mission',
            status: 'PUBLISHED',
          }),
        ]),
      );
    } finally {
      await context.close();
    }
  });
});
