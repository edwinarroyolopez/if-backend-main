import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';
import { expectAuthRateLimitWithoutUserLeak } from './helpers/security-auth-helpers';
import {
  expectPersistedDocumentationAndRoadmap,
  expectProjectUpdatePermissionRequired,
  expectProjectUpdatesPersist,
} from './helpers/security-project-docs';
import { expectProjectFoundationRules } from './helpers/security-project-foundation';
import {
  expectRefreshReplaySecurity,
  expectSessionAndScopeSecurity,
  expectStaleAuthorizationRejection,
} from './helpers/security-session-authz';

describe('Inflight backend security', () => {
  it('rejects revoked sessions, invalid issuer, invalid audience and cross-organization access', async () => {
    await expectSessionAndScopeSecurity();
  });

  it('distinguishes expired refresh from replay and persists replay audit after rejection', async () => {
    await expectRefreshReplaySecurity();
  });

  it('rejects stale authorization after role assignment, role permission and policy changes', async () => {
    await expectStaleAuthorizationRejection();
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
