import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from '../app-test-context';

export async function expectPersistedDocumentationAndRoadmap() {
  const context = await createTestContext();

  try {
    const { ownerAccessToken, organizationId } =
      await registerAndBootstrapOrganization(context, 'doc-roadmap');
    const fixtures = await createOperationalFixtures(
      context,
      ownerAccessToken,
      organizationId,
      'doc-roadmap',
    );

    const documentationResponse = await context.http
      .get(`/api/v1/projects/${fixtures.projectId}/documentation`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    expect(documentationResponse.body.projectId).toBe(fixtures.projectId);
    expect(documentationResponse.body.title).toBe('Documentacion del proyecto');
    expect(documentationResponse.body.slug).toBe('overview');
    expect(documentationResponse.body.pageType).toBe('OVERVIEW');
    expect(documentationResponse.body.status).toBe('DRAFT');
    expect(documentationResponse.body.version).toBeGreaterThanOrEqual(1);
    expect(documentationResponse.body.createdBy).toBeTruthy();

    const roadmapResponse = await context.http
      .get(`/api/v1/projects/${fixtures.projectId}/roadmap`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    expect(roadmapResponse.body.projectId).toBe(fixtures.projectId);
    expect(roadmapResponse.body.title).toBe('Roadmap del proyecto');
    expect(roadmapResponse.body.status).toBe('PLANNING');
    expect(roadmapResponse.body.version).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(roadmapResponse.body.items)).toBe(true);
    expect(Array.isArray(documentationResponse.body.checklist)).toBe(true);
  } finally {
    await context.close();
  }
}

export async function expectProjectUpdatePermissionRequired() {
  const context = await createTestContext();

  try {
    const { ownerAccessToken, organizationId } =
      await registerAndBootstrapOrganization(context, 'project-update-no-perm');
    const fixtures = await createOperationalFixtures(
      context,
      ownerAccessToken,
      organizationId,
      'project-update-no-perm',
    );

    const readOnlyRole = await context.http
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        organizationId,
        key: 'PROJECT_MEMBER_READ_ONLY',
        name: 'Project member read-only',
      })
      .expect(201);
    await context.http
      .post(`/api/v1/roles/${readOnlyRole.body.id as string}/permissions`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ permissionKeys: ['projects.project.read'] })
      .expect(201);

    const memberRegister = await context.http
      .post('/api/v1/auth/native/register')
      .send({
        email: 'project-member-read-only@test.dev',
        displayName: 'Project Member Read Only',
        password: 'ReadOnlyMember123!',
      })
      .expect(201);

    await context.http
      .post('/api/v1/role-assignments')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        organizationId,
        principalId: memberRegister.body.user.id as string,
        roleId: readOnlyRole.body.id as string,
        scopeType: 'ORGANIZATION',
        scopeId: organizationId,
      })
      .expect(201);

    const memberLogin = await context.http
      .post('/api/v1/auth/native/login')
      .send({
        email: 'project-member-read-only@test.dev',
        password: 'ReadOnlyMember123!',
        activeOrganizationId: organizationId,
      })
      .expect(201);

    await context.http
      .patch(`/api/v1/projects/${fixtures.projectId}/documentation`)
      .set('Authorization', `Bearer ${memberLogin.body.accessToken as string}`)
      .send({ title: 'Should fail' })
      .expect(403);

    await context.http
      .patch(`/api/v1/projects/${fixtures.projectId}/roadmap`)
      .set('Authorization', `Bearer ${memberLogin.body.accessToken as string}`)
      .send({ title: 'Should fail' })
      .expect(403);
  } finally {
    await context.close();
  }
}

export async function expectProjectUpdatesPersist() {
  const context = await createTestContext();

  try {
    const { ownerAccessToken, organizationId } =
      await registerAndBootstrapOrganization(context, 'project-update-ok');
    const fixtures = await createOperationalFixtures(
      context,
      ownerAccessToken,
      organizationId,
      'project-update-ok',
    );

    const documentationResponse = await context.http
      .patch(`/api/v1/projects/${fixtures.projectId}/documentation`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        title: 'Doc Actualizada',
        summary: 'Resumen actualizado con versionado.',
        checklist: [
          {
            id: 'goals-defined',
            text: 'Objetivos y restricciones iniciales definidos',
            required: true,
            completed: true,
          },
        ],
      })
      .expect(200);

    expect(documentationResponse.body.title).toBe('Doc Actualizada');
    expect(documentationResponse.body.version).toBe(2);

    const roadmapResponse = await context.http
      .patch(`/api/v1/projects/${fixtures.projectId}/roadmap`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        status: 'ACTIVE',
        horizonMonths: 12,
        notes: 'Plan de 12 meses con checkpoints',
        items: [
          {
            id: 'milestone-1',
            title: 'Diseño de alcance',
            startDate: '2026-01-01',
            endDate: '2026-01-15',
            status: 'PLANNED',
            owners: ['PM', 'Lead'],
            dependencies: [],
            deliveryRisk: 'Riesgo de capacidad.',
          },
        ],
      })
      .expect(200);

    expect(roadmapResponse.body.status).toBe('ACTIVE');
    expect(roadmapResponse.body.version).toBe(2);
    expect(roadmapResponse.body.horizonMonths).toBe(12);
    expect(Array.isArray(roadmapResponse.body.items)).toBe(true);

    const documentationUpdateAudits = await context.models.auditLogs.find({
      organizationId,
      action: 'projects.project.update',
      resourceId: fixtures.projectId,
      permissionKey: 'projects.project.update',
    });
    expect(documentationUpdateAudits).toHaveLength(2);
  } finally {
    await context.close();
  }
}
