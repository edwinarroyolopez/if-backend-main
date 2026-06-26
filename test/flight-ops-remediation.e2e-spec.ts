import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
  registerNativeUser,
} from './app-test-context';

describe('Flight Ops remediations', () => {
  it('rejects pilot assignment outside active org and inactive pilots', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'pilot-policy-a',
      );
      const second = await registerAndBootstrapOrganization(
        context,
        'pilot-policy-b',
      );
      const fixtures = await createOperationalFixtures(
        context,
        first.ownerAccessToken,
        first.organizationId,
        'pilot-policy',
      );
      const secondOwner = await context.models.users.findOne({
        email: second.ownerEmail,
      });
      if (!secondOwner) throw new Error('Expected second org owner');

      await context.http
        .post('/api/v1/missions/not-a-mongo-id/assign')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .set('Idempotency-Key', 'assign-invalid-mission-id')
        .send({ assignedPilotId: secondOwner.id })
        .expect(404);

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/assign`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .set('Idempotency-Key', 'assign-cross-org-pilot')
        .send({ assignedPilotId: secondOwner.id })
        .expect(404);

      await expectNoAssignmentEvent(context, fixtures.missionId);

      const suspendedPilot = await registerNativeUser(context, {
        email: 'suspended-pilot@test.dev',
        displayName: 'Suspended Pilot',
        password: 'PilotPassword123!',
      });
      await assignFlightOperatorRole(context, {
        accessToken: first.ownerAccessToken,
        organizationId: first.organizationId,
        principalId: suspendedPilot.body.user.id as string,
      });
      await context.models.users.updateOne(
        { _id: suspendedPilot.body.user.id as string },
        { $set: { status: 'SUSPENDED' } },
      );

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/assign`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .set('Idempotency-Key', 'assign-suspended-pilot')
        .send({ assignedPilotId: suspendedPilot.body.user.id as string })
        .expect(404);

      await expectNoAssignmentEvent(context, fixtures.missionId);
    } finally {
      await context.close();
    }
  });
});

async function assignFlightOperatorRole(
  context: Awaited<ReturnType<typeof createTestContext>>,
  input: { accessToken: string; organizationId: string; principalId: string },
) {
  const role = await context.models.roles.findOne({
    organizationId: input.organizationId,
    key: 'FLIGHT_OPERATOR',
  });
  if (!role) throw new Error('Expected FLIGHT_OPERATOR role');

  await context.http
    .post('/api/v1/role-assignments')
    .set('Authorization', `Bearer ${input.accessToken}`)
    .send({
      organizationId: input.organizationId,
      principalId: input.principalId,
      roleId: role.id,
      scopeType: 'ORGANIZATION',
      scopeId: input.organizationId,
    })
    .expect(201);
}

async function expectNoAssignmentEvent(
  context: Awaited<ReturnType<typeof createTestContext>>,
  missionId: string,
) {
  await expect(
    context.models.outbox.countDocuments({
      aggregateId: missionId,
      eventType: { $in: ['MissionAssigned.v1', 'MissionReassigned.v1'] },
    }),
  ).resolves.toBe(0);
}
