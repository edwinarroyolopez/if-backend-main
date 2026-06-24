import request from 'supertest';
import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Inflight backend e2e', () => {
  it('covers health plus web auth cookie flow', async () => {
    const context = await createTestContext();

    try {
      await request(context.app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);
      await request(context.app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      const registerResponse = await context.agent
        .post('/api/v1/auth/web/register')
        .send({
          email: 'web-user@test.dev',
          displayName: 'Web User',
          password: 'WebPassword123!',
        })
        .expect(201);
      expect(registerResponse.headers['set-cookie']).toBeDefined();
      expect(JSON.stringify(registerResponse.body)).not.toContain(
        'refreshTokenHash',
      );

      await context.agent
        .get('/api/v1/auth/me')
        .set(
          'Authorization',
          `Bearer ${registerResponse.body.accessToken as string}`,
        )
        .expect(200);

      const refreshResponse = await context.agent
        .post('/api/v1/auth/web/refresh')
        .expect(201);
      expect(typeof refreshResponse.body.accessToken).toBe('string');

      await context.agent
        .post('/api/v1/auth/web/logout')
        .set(
          'Authorization',
          `Bearer ${refreshResponse.body.accessToken as string}`,
        )
        .expect(201);
      await context.agent.post('/api/v1/auth/web/refresh').expect(401);
    } finally {
      await context.close();
    }
  });

  it('issues valid service-account tokens, rejects invalid audience and revokes stale tokens after rotation', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context, 'svc-e2e');
      await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'svc-e2e',
      );

      const orgAdminRole = await context.models.roles.findOne({
        organizationId,
        key: 'ORG_ADMIN',
      });
      expect(orgAdminRole).not.toBeNull();

      const serviceAccountResponse = await context.http
        .post('/api/v1/service-accounts')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          key: 'image-engine',
          name: 'Image Engine',
          ownerModule: 'image',
          allowedAudiences: ['inflight-test'],
          roleId: orgAdminRole!.id,
        })
        .expect(201);

      const serviceTokenResponse = await context.http
        .post('/api/v1/auth/service/token')
        .send({
          keyId: serviceAccountResponse.body.keyId as string,
          clientSecret: serviceAccountResponse.body.clientSecret as string,
          audience: 'inflight-test',
        })
        .expect(201);

      await context.http
        .get('/api/v1/projects')
        .set(
          'Authorization',
          `Bearer ${serviceTokenResponse.body.accessToken as string}`,
        )
        .expect(200);

      await context.http
        .post('/api/v1/auth/service/token')
        .send({
          keyId: serviceAccountResponse.body.keyId as string,
          clientSecret: serviceAccountResponse.body.clientSecret as string,
          audience: 'wrong-audience',
        })
        .expect(403);

      const rotatedCredential = await context.http
        .post(
          `/api/v1/service-accounts/${serviceAccountResponse.body.id as string}/rotate-credential`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);

      await context.http
        .get('/api/v1/projects')
        .set(
          'Authorization',
          `Bearer ${serviceTokenResponse.body.accessToken as string}`,
        )
        .expect(401);

      const refreshedServiceToken = await context.http
        .post('/api/v1/auth/service/token')
        .send({
          keyId: rotatedCredential.body.keyId as string,
          clientSecret: rotatedCredential.body.clientSecret as string,
          audience: 'inflight-test',
        })
        .expect(201);

      await context.http
        .get('/api/v1/projects')
        .set(
          'Authorization',
          `Bearer ${refreshedServiceToken.body.accessToken as string}`,
        )
        .expect(200);
    } finally {
      await context.close();
    }
  });
});
