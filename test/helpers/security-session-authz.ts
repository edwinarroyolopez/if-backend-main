import { JwtService } from '@nestjs/jwt';
import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
  registerNativeUser,
} from '../app-test-context';

export async function expectSessionAndScopeSecurity() {
  const context = await createTestContext();
  try {
    const first = await registerAndBootstrapOrganization(context, 'first-org');
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

    for (const jwtOptions of [
      { issuer: 'wrong-issuer', audience: 'inflight-test' },
      { issuer: 'inflight-test', audience: 'wrong-audience' },
    ]) {
      const token = new JwtService().sign(
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
          ...jwtOptions,
          algorithm: 'HS256',
          expiresIn: '15m',
        },
      );
      await context.http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
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
}

export async function expectRefreshReplaySecurity() {
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
      resourceId: loginResponse.body.sessionId,
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
    expect(replayResponse.body.reasonCode).toBe('AUTH_REFRESH_TOKEN_CONSUMED');
    const replayAudits = await context.models.auditLogs.find({
      resourceId: freshLogin.body.sessionId,
      reasonCode: 'AUTH_REFRESH_TOKEN_CONSUMED',
    });
    expect(replayAudits.length).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
}

export async function expectStaleAuthorizationRejection() {
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
      .send({ organizationId, key: 'AUTHZ_MEMBER', name: 'Authz Member' })
      .expect(201);
    await context.http
      .post(`/api/v1/roles/${roleResponse.body.id as string}/permissions`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ permissionKeys: ['projects.project.read'] })
      .expect(201);
    await assignRole(context, ownerAccessToken, organizationId, {
      principalId: memberRegister.body.user.id as string,
      roleId: roleResponse.body.id as string,
    });
    const memberLogin = await loginNativeUser(context, {
      email: 'member-authz@test.dev',
      password: 'MemberAuthz123!',
      activeOrganizationId: organizationId,
    });
    const secondRoleResponse = await context.http
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ organizationId, key: 'AUTHZ_EXTRA', name: 'Authz Extra' })
      .expect(201);
    await assignRole(context, ownerAccessToken, organizationId, {
      principalId: memberRegister.body.user.id as string,
      roleId: secondRoleResponse.body.id as string,
    });
    await expectTokenRejected(context, memberLogin.body.accessToken as string);

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
    await expectTokenRejected(
      context,
      reloginAfterAssignment.body.accessToken as string,
    );

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
}

async function assignRole(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
  organizationId: string,
  input: { principalId: string; roleId: string },
) {
  await context.http
    .post('/api/v1/role-assignments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      organizationId,
      principalId: input.principalId,
      roleId: input.roleId,
      scopeType: 'ORGANIZATION',
      scopeId: organizationId,
    })
    .expect(201);
}

async function expectTokenRejected(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
) {
  await context.http
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(401);
}
