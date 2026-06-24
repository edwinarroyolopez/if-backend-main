import { JwtService } from '@nestjs/jwt';
import { createOperationalFixtures, createTestContext, registerAndBootstrapOrganization } from './app-test-context';

describe('Inflight backend security', () => {
  it('rejects revoked sessions, invalid issuer and cross-organization access', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(context);
      const second = await registerAndBootstrapOrganization(context);
      const fixtures = await createOperationalFixtures(context, second.ownerAccessToken, second.organizationId);

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
      await context.http.get('/api/v1/auth/me').set('Authorization', `Bearer ${invalidIssuerToken}`).expect(401);

      await context.http
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .send({ organizationId: second.organizationId, key: 'client-sec', name: 'Client', extraField: 'blocked' })
        .expect(400);
    } finally {
      await context.close();
    }
  });
});
