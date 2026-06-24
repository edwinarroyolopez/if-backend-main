import { JwtService } from '@nestjs/jwt';
import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
  registerNativeUser,
} from './app-test-context';

describe('Inflight backend security', () => {
  it('rejects revoked sessions, invalid issuer, invalid audience and cross-organization access', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'first-org',
      );
      const second = await registerAndBootstrapOrganization(
        context,
        'second-org',
      );
      const fixtures = await createOperationalFixtures(
        context,
        second.ownerAccessToken,
        second.organizationId,
        'cross-org',
      );

      await context.http
        .get(`/api/v1/missions/${fixtures.missionId}`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .expect(403);

      await context.http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .expect(201);
      await context.http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .expect(401);

      const jwtService = new JwtService();
      const invalidIssuerToken = jwtService.sign(
        {
          sub: 'fake-user',
          principalType: 'USER',
          sessionId: 'fake-session',
          sessionVersion: 0,
          authorizationVersion: 0,
          authorizationFingerprint: 'invalid-fingerprint',
          sessionKind: 'HUMAN',
          readOnly: false,
        },
        {
          secret: 'test-access-secret',
          issuer: 'wrong-issuer',
          audience: 'inflight-test',
          algorithm: 'HS256',
          expiresIn: '15m',
        },
      );
      await context.http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${invalidIssuerToken}`)
        .expect(401);

      const invalidAudienceToken = jwtService.sign(
        {
          sub: 'fake-user',
          principalType: 'USER',
          sessionId: 'fake-session',
          sessionVersion: 0,
          authorizationVersion: 0,
          authorizationFingerprint: 'invalid-fingerprint',
          sessionKind: 'HUMAN',
          readOnly: false,
        },
        {
          secret: 'test-access-secret',
          issuer: 'inflight-test',
          audience: 'wrong-audience',
          algorithm: 'HS256',
          expiresIn: '15m',
        },
      );
      await context.http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${invalidAudienceToken}`)
        .expect(401);

      await context.http
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .send({
          organizationId: second.organizationId,
          key: 'client-sec',
          name: 'Client',
          extraField: 'blocked',
        })
        .expect(400);
    } finally {
      await context.close();
    }
  });

  it('distinguishes expired refresh from replay and persists replay audit after rejection', async () => {
    const context = await createTestContext();

    try {
      const registerResponse = await registerNativeUser(context, {
        email: 'refresh@test.dev',
        displayName: 'Refresh User',
        password: 'RefreshPassword123!',
      });
      const loginResponse = await loginNativeUser(context, {
        email: 'refresh@test.dev',
        password: 'RefreshPassword123!',
      });

      await context.models.authSessions.updateOne(
        { _id: loginResponse.body.sessionId as string },
        { $set: { expiresAt: new Date(Date.now() - 60_000) } },
      );
      const expiredRefresh = await context.http
        .post('/api/v1/auth/native/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken as string })
        .expect(401);
      expect(expiredRefresh.body.reasonCode).toBe('AUTH_SESSION_EXPIRED');

      const expiredReplayAudits = await context.models.auditLogs.find({
        resourceId: loginResponse.body.sessionId as string,
        action: 'auth.refresh.replay',
      });
      expect(expiredReplayAudits).toHaveLength(0);

      const freshLogin = await loginNativeUser(context, {
        email: registerResponse.body.user.email as string,
        password: 'RefreshPassword123!',
      });
      await context.http
        .post('/api/v1/auth/native/refresh')
        .send({ refreshToken: freshLogin.body.refreshToken as string })
        .expect(201);

      const replayResponse = await context.http
        .post('/api/v1/auth/native/refresh')
        .send({ refreshToken: freshLogin.body.refreshToken as string })
        .expect(401);
      expect(replayResponse.body.reasonCode).toBe(
        'AUTH_REFRESH_TOKEN_CONSUMED',
      );

      const replayAudits = await context.models.auditLogs.find({
        resourceId: freshLogin.body.sessionId as string,
        reasonCode: 'AUTH_REFRESH_TOKEN_CONSUMED',
      });
      expect(replayAudits.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  it('rejects stale authorization after role assignment, role permission and policy changes', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context, 'authz-stale');
      const memberRegister = await registerNativeUser(context, {
        email: 'member-authz@test.dev',
        displayName: 'Member Authz',
        password: 'MemberAuthz123!',
      });

      const roleResponse = await context.http
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          key: 'AUTHZ_MEMBER',
          name: 'Authz Member',
        })
        .expect(201);
      await context.http
        .post(`/api/v1/roles/${roleResponse.body.id as string}/permissions`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ permissionKeys: ['projects.project.read'] })
        .expect(201);
      await context.http
        .post('/api/v1/role-assignments')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          principalId: memberRegister.body.user.id as string,
          roleId: roleResponse.body.id as string,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        })
        .expect(201);

      const memberLogin = await loginNativeUser(context, {
        email: 'member-authz@test.dev',
        password: 'MemberAuthz123!',
        activeOrganizationId: organizationId,
      });

      const secondRoleResponse = await context.http
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          key: 'AUTHZ_EXTRA',
          name: 'Authz Extra',
        })
        .expect(201);
      await context.http
        .post('/api/v1/role-assignments')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          principalId: memberRegister.body.user.id as string,
          roleId: secondRoleResponse.body.id as string,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        })
        .expect(201);

      await context.http
        .get('/api/v1/auth/me')
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .expect(401);

      const reloginAfterAssignment = await loginNativeUser(context, {
        email: 'member-authz@test.dev',
        password: 'MemberAuthz123!',
        activeOrganizationId: organizationId,
      });
      await context.http
        .post(`/api/v1/roles/${roleResponse.body.id as string}/permissions`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          permissionKeys: ['projects.project.read', 'flight.mission.read'],
        })
        .expect(201);

      await context.http
        .get('/api/v1/auth/me')
        .set(
          'Authorization',
          `Bearer ${reloginAfterAssignment.body.accessToken as string}`,
        )
        .expect(401);

      const reloginAfterPermissions = await loginNativeUser(context, {
        email: 'member-authz@test.dev',
        password: 'MemberAuthz123!',
        activeOrganizationId: organizationId,
      });
      await context.models.accessPolicies.updateOne(
        { key: 'GLOBAL' },
        { $inc: { version: 1 } },
      );

      const stalePolicyResponse = await context.http
        .get('/api/v1/auth/me')
        .set(
          'Authorization',
          `Bearer ${reloginAfterPermissions.body.accessToken as string}`,
        )
        .expect(401);
      expect(stalePolicyResponse.body.reasonCode).toBe('PERMISSION_DENIED');
    } finally {
      await context.close();
    }
  });

  it('denies project detail to principals without projects.project.read', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context, 'no-project-read');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'no-project-read',
      );

      const roleResponse = await context.http
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          key: 'PROJECT_MEMBER_NO_READ',
          name: 'Project member without read',
        })
        .expect(201);

      const userResponse = await context.http
        .post('/api/v1/auth/native/register')
        .send({
          email: 'member-no-read@test.dev',
          displayName: 'No Read Member',
          password: 'NoReadMember123!',
        })
        .expect(201);

      await context.http
        .post('/api/v1/role-assignments')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          principalId: userResponse.body.user.id as string,
          roleId: roleResponse.body.id as string,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        })
        .expect(201);

      const memberLogin = await context.http
        .post('/api/v1/auth/native/login')
        .send({
          email: 'member-no-read@test.dev',
          password: 'NoReadMember123!',
          activeOrganizationId: organizationId,
        })
        .expect(201);

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}`)
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .expect(403);

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/documentation`)
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .expect(403);

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/roadmap`)
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .expect(403);
    } finally {
      await context.close();
    }
  });

  it('denies project detail across organization scope using ResolveResource', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'project-scope-org-a',
      );
      const second = await registerAndBootstrapOrganization(
        context,
        'project-scope-org-b',
      );
      const fixtures = await createOperationalFixtures(
        context,
        first.ownerAccessToken,
        first.organizationId,
        'project-scope',
      );

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}`)
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .expect(403);

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/documentation`)
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .expect(403);

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/roadmap`)
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .expect(403);
    } finally {
      await context.close();
    }
  });

  it('enforces project foundation creation, lifecycle, health and readiness rules', async () => {
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
        .post(`/api/v1/projects/${internalProjectResponse.body.id as string}/transitions`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({ targetStatus: 'ACTIVE' })
        .expect(201);
      expect(activeResponse.body.status).toBe('ACTIVE');

      await context.http
        .post(`/api/v1/projects/${internalProjectResponse.body.id as string}/transitions`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({ targetStatus: 'ARCHIVED' })
        .expect(409);

      const healthResponse = await context.http
        .post(`/api/v1/projects/${internalProjectResponse.body.id as string}/health`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({
          health: 'AT_RISK',
          healthReason: 'Capacity is not confirmed.',
        })
        .expect(201);
      expect(healthResponse.body.health).toBe('AT_RISK');
      expect(healthResponse.body.healthReason).toBe(
        'Capacity is not confirmed.',
      );
      expect(typeof healthResponse.body.healthUpdatedAt).toBe('string');

      const readinessResponse = await context.http
        .get(`/api/v1/projects/${internalProjectResponse.body.id as string}/readiness`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .expect(200);
      expect(readinessResponse.body.level).toBe('EMPTY');
      expect(readinessResponse.body.nextLevel).toBe('DOCUMENTING');
      expect(readinessResponse.body.blockingReasons[0].code).toBe(
        'USEFUL_DOCUMENTATION_REQUIRED',
      );

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
  });

  it('maps throttling to AUTH_RATE_LIMITED without leaking user existence', async () => {
    const context = await createTestContext();

    try {
      let lastResponse = null as Awaited<
        ReturnType<typeof context.http.post>
      > | null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        lastResponse = await context.http
          .post('/api/v1/auth/native/login')
          .send({
            email: 'missing-user@test.dev',
            password: 'WrongPassword123!',
          });
      }

      expect(lastResponse?.status).toBe(429);
      expect(lastResponse?.body.reasonCode).toBe('AUTH_RATE_LIMITED');
      expect(typeof lastResponse?.body.requestId).toBe('string');
      expect(JSON.stringify(lastResponse?.body)).not.toContain(
        'missing-user@test.dev',
      );
    } finally {
      await context.close();
    }
  });

  it('returns persisted project documentation and roadmap payloads', async () => {
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
      expect(documentationResponse.body.title).toBe(
        'Documentacion del proyecto',
      );
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
  });

  it('requires projects.project.update to modify documentation and roadmap', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(
          context,
          'project-update-no-perm',
        );
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
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .send({ title: 'Should fail' })
        .expect(403);

      await context.http
        .patch(`/api/v1/projects/${fixtures.projectId}/roadmap`)
        .set(
          'Authorization',
          `Bearer ${memberLogin.body.accessToken as string}`,
        )
        .send({ title: 'Should fail' })
        .expect(403);
    } finally {
      await context.close();
    }
  });

  it('persists documentation and roadmap edits with projects.project.update', async () => {
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
  });
});
