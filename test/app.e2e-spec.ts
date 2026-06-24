import request from 'supertest';
import { createOperationalFixtures, createTestContext, registerAndBootstrapOrganization } from './app-test-context';

describe('Inflight backend e2e', () => {
  it('covers health, auth, permissions, mission completion and service accounts', async () => {
    const context = await createTestContext();

    try {
      await request(context.app.getHttpServer()).get('/api/v1/health/live').expect(200);
      await request(context.app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      const { ownerAccessToken, organizationId } = await registerAndBootstrapOrganization(context);

      await context.agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${ownerAccessToken}`).expect(200);

      const webLogin = await context.agent.post('/api/v1/auth/web/login').send({
        email: 'owner-login@test.dev',
        displayName: 'ignored',
      });
      void webLogin;

      const nativeRegister = await context.http.post('/api/v1/auth/native/register').send({
        email: 'member@test.dev',
        displayName: 'Member User',
        password: 'MemberPassword123!',
      });

      const roleResponse = await context.http.post('/api/v1/roles').set('Authorization', `Bearer ${ownerAccessToken}`).send({
        organizationId,
        key: 'MISSION_OPERATOR',
        name: 'Mission Operator',
      });
      await context.http
        .post(`/api/v1/roles/${roleResponse.body.id}/permissions`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ permissionKeys: ['flight.mission.read', 'flight.mission.complete'] })
        .expect(201);
      await context.http.post('/api/v1/role-assignments').set('Authorization', `Bearer ${ownerAccessToken}`).send({
        organizationId,
        principalId: nativeRegister.body.user.id,
        roleId: roleResponse.body.id,
        scopeType: 'ORGANIZATION',
        scopeId: organizationId,
      }).expect(201);

      const nativeLogin = await context.http.post('/api/v1/auth/native/login').send({
        email: 'member@test.dev',
        password: 'MemberPassword123!',
        activeOrganizationId: organizationId,
      }).expect(201);

      await context.http
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ organizationId, key: 'client-a', name: 'Client A' })
        .expect(201);

      const fixtures = await createOperationalFixtures(context, ownerAccessToken, organizationId);
      await context.http
        .get(`/api/v1/missions/${fixtures.missionId}`)
        .set('Authorization', `Bearer ${nativeLogin.body.accessToken}`)
        .expect(200);

      await context.http
        .post(`/api/v1/missions/${fixtures.missionId}/complete`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'mission-complete-e2e')
        .expect(201);

      const orgAdminRole = await context.models.roles.findOne({ organizationId, key: 'ORG_ADMIN' });
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

      const serviceTokenResponse = await context.http.post('/api/v1/auth/service/token').send({
        keyId: serviceAccountResponse.body.keyId,
        clientSecret: serviceAccountResponse.body.clientSecret,
        audience: 'inflight-test',
      }).expect(201);

      await context.http
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${serviceTokenResponse.body.accessToken}`)
        .expect(200);
    } finally {
      await context.close();
    }
  });
});
