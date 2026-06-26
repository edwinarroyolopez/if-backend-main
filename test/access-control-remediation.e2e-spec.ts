import {
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Access control remediations', () => {
  it('rejects cross-organization role permission mutation without leaking role existence', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'role-cross-org-a',
      );
      const second = await registerAndBootstrapOrganization(
        context,
        'role-cross-org-b',
      );
      const secondRole = await context.models.roles.findOne({
        organizationId: second.organizationId,
        key: 'SALES_MANAGER',
      });
      expect(secondRole).toBeTruthy();
      const originalVersion = secondRole!.version;

      await context.http
        .post(`/api/v1/roles/${secondRole!.id}/permissions`)
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({ permissionKeys: ['crm.client.read'] })
        .expect(404);

      const unchangedRole = await context.models.roles.findById(secondRole!.id);
      expect(unchangedRole?.version).toBe(originalVersion);
    } finally {
      await context.close();
    }
  });

  it('returns a stable non-500 response for invalid role ObjectIds', async () => {
    const context = await createTestContext();

    try {
      const first = await registerAndBootstrapOrganization(
        context,
        'role-invalid-id',
      );

      await context.http
        .post('/api/v1/roles/not-an-object-id/permissions')
        .set('Authorization', `Bearer ${first.ownerAccessToken}`)
        .send({ permissionKeys: ['crm.client.read'] })
        .expect(404);
    } finally {
      await context.close();
    }
  });
});
