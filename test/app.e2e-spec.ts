import request from 'supertest';
import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
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

  it('mirrors project connector connections with local projectKey validation, redaction and sync', async () => {
    const context = await createTestContext();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    global.fetch = fetchMock;
    const secretApiKey = 'test-runtime-secret-key';

    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'connector-mirror');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'connector-mirror',
      );
      const projectKey = 'project-connector-mirror';

      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/connect`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          connectionId: '66f000000000000000000001',
          apiKey: secretApiKey,
          projectKey: 'wrong-project',
          host: 'erp.test.local',
        })
        .expect(403)
        .expect((response) => {
          expect(response.body.reasonCode).toBe(
            'PROJECT_CONNECTOR_PROJECT_KEY_MISMATCH',
          );
        });
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          connection: {
            id: '66f000000000000000000001',
            connectorId: '66f000000000000000000002',
            projectKey,
            host: 'erp.test.local',
            status: 'CONNECTED',
            apiKeyPrefix: 'ifc_test_',
            connectedAt: '2026-06-25T10:00:00.000Z',
            lastSyncedAt: '2026-06-25T10:01:00.000Z',
          },
          connector: {
            id: '66f000000000000000000002',
            key: 'if-erp',
            name: 'IF ERP',
            status: 'ACTIVE',
          },
          endpoints: [
            {
              id: '66f000000000000000000003',
              key: 'customers.list',
              name: 'List customers',
              method: 'GET',
              path: '/customers',
              status: 'ACTIVE',
            },
          ],
        }),
      );

      const connectResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/connect`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          connectionId: '66f000000000000000000001',
          apiKey: secretApiKey,
          projectKey,
          host: 'ERP.TEST.LOCAL',
        })
        .expect(201);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://127.0.0.1:7100/api/v1/connections/validate',
      );
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: `Bearer ${secretApiKey}`,
      });
      expect(JSON.stringify(connectResponse.body)).not.toContain(secretApiKey);
      expect(connectResponse.body).toMatchObject({
        remoteConnectionId: '66f000000000000000000001',
        remoteConnectorId: '66f000000000000000000002',
        connectorKey: 'if-erp',
        projectKey,
        host: 'erp.test.local',
        status: 'CONNECTED',
      });
      expect(connectResponse.body.apiKey).toBeUndefined();
      expect(connectResponse.body.endpoints).toHaveLength(1);

      const mirrorId = connectResponse.body.id as string;
      const storedMirror = await context.models.projectConnectorMirrors
        .findById(mirrorId)
        .select('+apiKey');
      expect(storedMirror?.apiKey).toBe(secretApiKey);

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          connection: {
            id: '66f000000000000000000001',
            connectorId: '66f000000000000000000002',
            projectKey,
            host: 'erp.test.local',
            status: 'CONNECTED',
            apiKeyPrefix: 'ifc_test_',
            connectedAt: '2026-06-25T10:00:00.000Z',
            lastSyncedAt: '2026-06-25T10:02:00.000Z',
          },
          connector: {
            id: '66f000000000000000000002',
            key: 'if-erp',
            name: 'IF ERP',
            status: 'ACTIVE',
          },
          endpoints: [],
        }),
      );
      const duplicateResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/connect`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          connectionId: '66f000000000000000000001',
          apiKey: secretApiKey,
          projectKey,
          host: 'erp.test.local',
        })
        .expect(201);
      expect(duplicateResponse.body.id).toBe(mirrorId);
      await expect(
        context.models.projectConnectorMirrors.countDocuments({
          projectId: fixtures.projectId,
          remoteConnectionId: '66f000000000000000000001',
        }),
      ).resolves.toBe(1);

      const listResponse = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/integrations/connectors`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(JSON.stringify(listResponse.body)).not.toContain(secretApiKey);
      expect(listResponse.body.items).toHaveLength(1);

      const detailResponse = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/${mirrorId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(detailResponse.body.apiKey).toBeUndefined();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          connection: {
            id: '66f000000000000000000001',
            status: 'BLOCKED',
            blockedReason: 'Remote quota exceeded',
          },
        }),
      );
      const blockedSyncResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/${mirrorId}/sync`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(blockedSyncResponse.body).toMatchObject({
        status: 'BLOCKED',
        blockedReason: 'Remote quota exceeded',
      });
      expect(JSON.stringify(blockedSyncResponse.body)).not.toContain(
        secretApiKey,
      );

      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            reasonCode: 'CONNECTOR_CONNECTION_REVOKED',
            message: 'Revoked connection is terminal',
          },
          409,
        ),
      );
      const revokedSyncResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/${mirrorId}/sync`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(revokedSyncResponse.body.status).toBe('REVOKED');
      expect(JSON.stringify(revokedSyncResponse.body)).not.toContain(
        secretApiKey,
      );

      const auditLogs = await context.models.auditLogs.find({
        resourceType: 'PROJECT_CONNECTOR_MIRROR',
      });
      expect(auditLogs.map((audit) => audit.action)).toEqual(
        expect.arrayContaining([
          'PROJECT_CONNECTOR_CONNECTED',
          'PROJECT_CONNECTOR_BLOCKED_SYNCED',
          'PROJECT_CONNECTOR_REVOKED_SYNCED',
        ]),
      );
      expect(JSON.stringify(auditLogs)).not.toContain(secretApiKey);
      expect(JSON.stringify(auditLogs)).not.toContain('Authorization');

      const readOnlyLogin = await loginNativeUser(context, {
        email: ownerEmail,
        password: 'OwnerPassword123!',
        activeOrganizationId: organizationId,
      });
      await context.models.authSessions.updateOne(
        { _id: readOnlyLogin.body.sessionId as string },
        { $set: { readOnly: true } },
      );
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/integrations/connectors/${mirrorId}/sync`,
        )
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .expect(403)
        .expect((response) => {
          expect(response.body.reasonCode).toBe('AUTH_READ_ONLY_SESSION');
        });
    } finally {
      global.fetch = originalFetch;
      await context.close();
    }
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
