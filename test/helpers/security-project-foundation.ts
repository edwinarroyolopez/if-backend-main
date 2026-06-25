import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from '../app-test-context';

export async function expectProjectFoundationRules() {
  const context = await createTestContext();

  try {
    const first = await registerAndBootstrapOrganization(
      context,
      'project-foundation-a',
    );
    const second = await registerAndBootstrapOrganization(
      context,
      'project-foundation-b',
    );
    const fixtures = await createOperationalFixtures(
      context,
      first.ownerAccessToken,
      first.organizationId,
      'project-foundation',
    );

    const internalProjectResponse = await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'internal-project-foundation')
      .send({
        organizationId: first.organizationId,
        projectKind: 'INTERNAL',
        key: 'internal-foundation',
        name: 'Internal Foundation',
        description: 'Internal operating-system project.',
        objective: 'Validate internal project creation without CRM client.',
      })
      .expect(201);

    expect(internalProjectResponse.body.projectKind).toBe('INTERNAL');
    expect(internalProjectResponse.body.clientId).toBeUndefined();
    expect(internalProjectResponse.body.health).toBe('ON_TRACK');

    const generatedKeyProjectResponse = await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'generated-key-project')
      .send({
        organizationId: first.organizationId,
        projectKind: 'INTERNAL',
        name: 'Automatización IA / Fase 2',
      })
      .expect(201);
    expect(generatedKeyProjectResponse.body.key).toBe(
      'automatizacion-ia-fase-2',
    );

    const duplicateGeneratedKeyResponse = await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'generated-key-project-duplicate')
      .send({
        organizationId: first.organizationId,
        projectKind: 'INTERNAL',
        name: 'Automatización IA / Fase 2',
      })
      .expect(409);
    expect(duplicateGeneratedKeyResponse.body.metadata.field).toBe('key');
    expect(duplicateGeneratedKeyResponse.body.metadata.suggestedKey).toBe(
      'automatizacion-ia-fase-2-2',
    );

    const replayResponse = await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'internal-project-foundation')
      .send({
        organizationId: first.organizationId,
        projectKind: 'INTERNAL',
        key: 'internal-foundation',
        name: 'Internal Foundation',
      })
      .expect(201);
    expect(replayResponse.body.id).toBe(internalProjectResponse.body.id);

    await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'client-without-client')
      .send({
        organizationId: first.organizationId,
        projectKind: 'CLIENT',
        key: 'client-no-client',
        name: 'Client Without Client',
      })
      .expect(400);

    await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .set('Idempotency-Key', 'cross-org-client')
      .send({
        organizationId: first.organizationId,
        projectKind: 'CLIENT',
        clientId: fixtures.clientId,
        key: 'cross-org-client',
        name: 'Cross Org Client',
      })
      .expect(201);

    await context.http
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${second.ownerAccessToken}`)
      .set('Idempotency-Key', 'wrong-client-org')
      .send({
        organizationId: second.organizationId,
        projectKind: 'CLIENT',
        clientId: fixtures.clientId,
        key: 'wrong-client-org',
        name: 'Wrong Client Org',
      })
      .expect(409);

    const activeResponse = await context.http
      .post(
        `/api/v1/projects/${internalProjectResponse.body.id as string}/transitions`,
      )
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .send({ targetStatus: 'ACTIVE' })
      .expect(201);
    expect(activeResponse.body.status).toBe('ACTIVE');

    await context.http
      .post(
        `/api/v1/projects/${internalProjectResponse.body.id as string}/transitions`,
      )
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .send({ targetStatus: 'ARCHIVED' })
      .expect(409);

    const healthResponse = await context.http
      .post(
        `/api/v1/projects/${internalProjectResponse.body.id as string}/health`,
      )
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .send({
        health: 'AT_RISK',
        healthReason: 'Capacity is not confirmed.',
      })
      .expect(201);
    expect(healthResponse.body.health).toBe('AT_RISK');
    expect(healthResponse.body.healthReason).toBe('Capacity is not confirmed.');
    expect(typeof healthResponse.body.healthUpdatedAt).toBe('string');

    const readinessResponse = await context.http
      .get(
        `/api/v1/projects/${internalProjectResponse.body.id as string}/readiness`,
      )
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .expect(200);
    expect(readinessResponse.body.status).toBe('EMPTY');
    expect(readinessResponse.body.level).toBe('EMPTY');
    expect(readinessResponse.body.nextLevel).toBe('DOCUMENTING');
    expect(readinessResponse.body.progress).toBe(0);
    expect(readinessResponse.body.blockingReasons[0].code).toBe(
      'USEFUL_DOCUMENTATION_REQUIRED',
    );
    expect(readinessResponse.body.completedSignals).toEqual([]);
    expect(readinessResponse.body.nextRecommendedAction.code).toBe(
      'START_DOCUMENTATION',
    );

    await context.http
      .patch(`/api/v1/projects/${internalProjectResponse.body.id as string}`)
      .set('Authorization', `Bearer ${first.ownerAccessToken}`)
      .send({ readiness: 'READY_TO_START' })
      .expect(400);

    const audits = await context.models.auditLogs.find({
      organizationId: first.organizationId,
      resourceId: internalProjectResponse.body.id as string,
    });
    expect(
      audits.some((audit) => audit.action === 'projects.project.transition'),
    ).toBe(true);
    expect(
      audits.some((audit) => audit.action === 'projects.project.health'),
    ).toBe(true);
  } finally {
    await context.close();
  }
}
