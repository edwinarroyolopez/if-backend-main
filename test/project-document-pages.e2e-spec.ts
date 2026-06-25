import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Project document pages', () => {
  it('persists page lifecycle, authorization, slug and readiness rules', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context, 'doc-pages');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'doc-pages',
      );

      const emptyReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(emptyReadiness.body.status).toBe('EMPTY');

      const createResponse = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-page-create-overview')
        .send({
          title: 'Vision general del proyecto',
          summary: 'Resumen operativo real del proyecto.',
          bodyMarkdown: 'Contenido documental persistido para el proyecto.',
          pageType: 'OVERVIEW',
          checklist: [
            {
              id: 'scope-reviewed',
              text: 'Alcance inicial revisado',
              required: true,
              completed: false,
            },
          ],
          facts: ['El proyecto tiene documentacion manual.'],
        })
        .expect(201);
      expect(createResponse.body.slug).toBe('vision-general-del-proyecto');
      expect(createResponse.body.status).toBe('DRAFT');
      expect(createResponse.body.version).toBe(1);

      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-page-create-duplicate')
        .send({
          title: 'Otra vision',
          slug: 'vision-general-del-proyecto',
          bodyMarkdown: 'Contenido alternativo que no debe persistir.',
          pageType: 'NOTES',
        })
        .expect(409);

      const listResponse = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(listResponse.body.items).toHaveLength(1);

      const pageId = createResponse.body.id as string;
      const readResponse = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(readResponse.body.id).toBe(pageId);
      expect(readResponse.body.bodyMarkdown).toContain('persistido');

      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 99, summary: 'Version incorrecta' })
        .expect(409);

      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 1, extraField: 'blocked' })
        .expect(400);

      const updateResponse = await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: 1,
          summary: 'Resumen actualizado con version esperada.',
          assumptions: ['La documentacion se edita manualmente.'],
        })
        .expect(200);
      expect(updateResponse.body.version).toBe(2);
      expect(updateResponse.body.assumptions).toContain(
        'La documentacion se edita manualmente.',
      );

      const documentingReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(documentingReadiness.body.status).toBe('DOCUMENTING');

      const reviewResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}/submit-review`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 2 })
        .expect(201);
      expect(reviewResponse.body.status).toBe('IN_REVIEW');
      expect(reviewResponse.body.version).toBe(3);

      const approveResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}/approve`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-page-approve-overview')
        .send({ expectedVersion: 3 })
        .expect(201);
      expect(approveResponse.body.status).toBe('APPROVED');
      expect(approveResponse.body.version).toBe(4);

      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 4, summary: 'No debe mutar approved' })
        .expect(409);

      const documentedReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(documentedReadiness.body.status).toBe('DOCUMENTED');

      const secondPage = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-page-create-notes')
        .send({
          title: 'Notas de entrega',
          bodyMarkdown: 'Notas persistidas para ordenar paginas.',
          pageType: 'NOTES',
        })
        .expect(201);

      const reorderResponse = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages/reorder`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-page-reorder-1')
        .send({
          items: [
            { id: secondPage.body.id as string, sortOrder: 0 },
            { id: pageId, sortOrder: 1 },
          ],
        })
        .expect(201);
      expect(reorderResponse.body.items[0].id).toBe(secondPage.body.id);

      const archiveResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${pageId}/archive`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 5 })
        .expect(201);
      expect(archiveResponse.body.status).toBe('ARCHIVED');

      const approvalAudits = await context.models.auditLogs.find({
        organizationId,
        action: 'projects.documentation.approve',
        resourceId: pageId,
      });
      expect(approvalAudits).toHaveLength(1);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'doc-pages-cross-org',
      );
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);

      const readOnlyLogin = await loginNativeUser(context, {
        email: secondOrg.ownerEmail,
        password: 'OwnerPassword123!',
        activeOrganizationId: secondOrg.organizationId,
      });
      await context.models.authSessions.updateOne(
        { _id: readOnlyLogin.body.sessionId as string },
        { $set: { readOnly: true } },
      );
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .set('Idempotency-Key', 'doc-page-readonly-write')
        .send({ title: 'Blocked', bodyMarkdown: 'Blocked write.' })
        .expect(403);
    } finally {
      await context.close();
    }
  });
});
