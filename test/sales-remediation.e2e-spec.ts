import {
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Sales remediations', () => {
  it('creates opportunities only for clients in the active organization', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'sales-client-a',
      );
      const second = await registerAndBootstrapOrganization(
        context,
        'sales-client-b',
      );
      const secondClient = await context.http
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${second.ownerAccessToken}`)
        .send({
          organizationId: second.organizationId,
          key: 'external-client',
          name: 'External Client',
        })
        .expect(201);

      await context.http
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({
          organizationId: first.organizationId,
          clientId: getId(secondClient.body),
          name: 'Cross Org Opportunity',
        })
        .expect(404);

      const firstClient = await context.http
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({
          organizationId: first.organizationId,
          key: 'local-client',
          name: 'Local Client',
        })
        .expect(201);

      await context.http
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({
          organizationId: first.organizationId,
          clientId: getId(firstClient.body),
          name: 'Local Opportunity',
        })
        .expect(201);
    } finally {
      await context.close();
    }
  });
});

function getId(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  throw new Error('Expected response id');
}
