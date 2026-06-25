import { JwtService } from '@nestjs/jwt';
import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
  registerNativeUser,
} from './app-test-context';
import { expectAuthRateLimitWithoutUserLeak } from './helpers/security-auth-helpers';
import {
  expectPersistedDocumentationAndRoadmap,
  expectProjectUpdatePermissionRequired,
  expectProjectUpdatesPersist,
} from './helpers/security-project-docs';
import { expectProjectFoundationRules } from './helpers/security-project-foundation';

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

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
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

      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .expect(403);
    } finally {
      await context.close();
    }
  });

  it('enforces project foundation creation, lifecycle, health and readiness rules', async () => {
    await expectProjectFoundationRules();
  }, 15000);

  it('maps throttling to AUTH_RATE_LIMITED without leaking user existence', async () => {
    await expectAuthRateLimitWithoutUserLeak();
  });

  it('returns persisted project documentation and roadmap payloads', async () => {
    await expectPersistedDocumentationAndRoadmap();
  });

  it('requires projects.project.update to modify documentation and roadmap', async () => {
    await expectProjectUpdatePermissionRequired();
  });

  it('persists documentation and roadmap edits with projects.project.update', async () => {
    await expectProjectUpdatesPersist();
  });
});
