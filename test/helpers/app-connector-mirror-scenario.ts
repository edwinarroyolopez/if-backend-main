import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from '../app-test-context';

export async function runConnectorMirrorScenario() {
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
      .select('+apiKeyCiphertext');
    expect(storedMirror?.apiKeyCiphertext).toEqual(expect.any(String));
    expect(storedMirror?.apiKeyCiphertext).not.toContain(secretApiKey);

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
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
