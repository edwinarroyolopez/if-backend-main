import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Project context snapshots', () => {
  it('creates immutable approved-documentation snapshots with idempotency and audit', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'context-snapshots');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'context-snapshots',
      );

      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-no-approved')
        .expect(409);

      const page = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-doc-create')
        .send({
          title: 'Contexto aprobado',
          summary: 'Resumen aprobado para snapshot.',
          bodyMarkdown: 'Contenido aprobado que alimenta roadmap.',
          pageType: 'OVERVIEW',
          checklist: [
            {
              id: 'scope-locked',
              text: 'Alcance aprobado bloqueado',
              required: true,
              completed: true,
            },
          ],
          facts: ['Fact aprobado'],
          assumptions: ['Supuesto aprobado'],
          decisions: ['Decision aprobada'],
          risks: ['Riesgo aprobado'],
          openQuestions: ['Pregunta aprobada'],
        })
        .expect(201);
      const review = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${page.body.id as string}/submit-review`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 1 })
        .expect(201);
      const approved = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${page.body.id as string}/approve`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-doc-approve')
        .send({ expectedVersion: review.body.version as number })
        .expect(201);

      const snapshot = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-create-approved')
        .expect(201);
      expect(snapshot.body.sourcePageIds).toEqual([page.body.id]);
      expect(snapshot.body.sourcePageVersions).toEqual({
        [page.body.id as string]: approved.body.version,
      });
      expect(snapshot.body.approvedDocumentationHash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.body.facts).toContain('Fact aprobado');
      expect(snapshot.body.constraints).toContain('Alcance aprobado bloqueado');

      const repeat = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-create-approved')
        .expect(201);
      expect(repeat.body.id).toBe(snapshot.body.id);

      const secondPage = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-doc-create-second')
        .send({
          title: 'Cambio posterior',
          summary: 'Esta pagina se crea despues del snapshot.',
          bodyMarkdown: 'No debe mutar el snapshot existente.',
          pageType: 'NOTES',
        })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${secondPage.body.id as string}/submit-review`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 1 })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${secondPage.body.id as string}/approve`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'snapshot-doc-approve-second')
        .send({ expectedVersion: 2 })
        .expect(201);

      const unchanged = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/context-snapshots/${snapshot.body.id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(unchanged.body.approvedDocumentationHash).toBe(
        snapshot.body.approvedDocumentationHash,
      );
      expect(unchanged.body.sourcePageIds).toEqual([page.body.id]);

      const list = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(list.body.items).toHaveLength(1);

      const audits = await context.models.auditLogs.find({
        organizationId,
        action: 'projects.context_snapshot.create',
        resourceId: snapshot.body.id as string,
      });
      expect(audits).toHaveLength(1);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'context-snapshots-cross-org',
      );
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);

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
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .set('Idempotency-Key', 'snapshot-readonly')
        .expect(403);
    } finally {
      await context.close();
    }
  });
});
