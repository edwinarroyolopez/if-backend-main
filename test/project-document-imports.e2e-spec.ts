import {
  additionalPropertyImport,
  duplicateSlugImport,
  emptyBodyImport,
  invalidChecklistImport,
  invalidPageTypeImport,
  invalidSchemaVersionImport,
  validProjectDocumentImport,
} from './fixtures/project-document-imports';
import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';

describe('Project document imports', () => {
  it('generates prompt, previews external JSON and commits draft pages idempotently', async () => {
    const context = await createTestContext();

    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'doc-imports');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'doc-imports',
      );
      const project = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const projectName = project.body.name as string;
      const projectKey = project.body.key as string;

      const promptResponse = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/prompts/documentation-interview`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(promptResponse.body.prompt).toContain(
        'InflightOS does not call any AI provider',
      );
      expect(promptResponse.body.prompt).toContain(projectName);
      expect(promptResponse.body.projectContext.key).toBe(projectKey);
      expect(promptResponse.body.contractVersion).toBe(
        'inflight.project.documentation.v1',
      );

      const validPayload = validProjectDocumentImport(projectName, projectKey);
      const previewResponse = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ documentImport: validPayload })
        .expect(201);
      expect(previewResponse.body.valid).toBe(true);
      expect(previewResponse.body.previewToken).toMatch(
        /^doc-import-preview-v1\./,
      );
      expect(previewResponse.body.pagesToCreate).toHaveLength(2);
      expect(previewResponse.body.pagesToCreate[0]).toMatchObject({
        slug: 'vision-documental-importada',
        pageType: 'OVERVIEW',
        checklistCount: 1,
        factsCount: 1,
      });
      expect(previewResponse.body.normalizedPages).toBeUndefined();

      const pagesBeforeCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(pagesBeforeCommit.body.items).toHaveLength(0);

      const commitResponse = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-import-commit-valid')
        .send({
          documentImport: validPayload,
          previewToken: previewResponse.body.previewToken as string,
        })
        .expect(201);
      expect(commitResponse.body.committed).toBe(true);
      expect(commitResponse.body.summary.pagesCreated).toBe(2);
      expect(commitResponse.body.summary.draftPagesCreated).toBe(2);
      expect(commitResponse.body.pages[0]).toMatchObject({
        status: 'DRAFT',
        source: 'AI_IMPORT',
      });

      const repeatedCommitResponse = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'doc-import-commit-valid')
        .send({
          documentImport: validPayload,
          previewToken: previewResponse.body.previewToken as string,
        })
        .expect(201);
      expect(
        repeatedCommitResponse.body.pages.map(
          (page: { id: string }) => page.id,
        ),
      ).toEqual(
        commitResponse.body.pages.map((page: { id: string }) => page.id),
      );

      const pagesAfterCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(pagesAfterCommit.body.items).toHaveLength(2);
      expect(
        pagesAfterCommit.body.items.every(
          (page: { status: string }) => page.status === 'DRAFT',
        ),
      ).toBe(true);

      const readinessAfterCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(readinessAfterCommit.body.status).toBe('DOCUMENTING');

      const importAudits = await context.models.auditLogs.find({
        organizationId,
        action: 'projects.documentation.import_commit',
        resourceId: fixtures.projectId,
      });
      expect(importAudits).toHaveLength(1);

      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        invalidSchemaVersionImport(projectName, projectKey),
        '$.schemaVersion',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        additionalPropertyImport(projectName, projectKey),
        '$.unexpected',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        invalidPageTypeImport(projectName, projectKey),
        '$.pages[0].pageType',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        duplicateSlugImport(projectName, projectKey),
        '$.pages[1].slug',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        emptyBodyImport(projectName, projectKey),
        '$.pages[0].bodyMarkdown',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        invalidChecklistImport(projectName, projectKey),
        '$.pages[0].checklist[0].completed',
      );
      await expectInvalidPreview(
        context,
        ownerAccessToken,
        fixtures.projectId,
        validPayload,
        '$.pages[0].slug',
      );

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'doc-imports-cross-org',
      );
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/preview`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ documentImport: validPayload })
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
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .set('Idempotency-Key', 'doc-import-readonly')
        .send({
          documentImport: validPayload,
          previewToken: previewResponse.body.previewToken as string,
        })
        .expect(403);
    } finally {
      await context.close();
    }
  });
});

async function expectInvalidPreview(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
  projectId: string,
  documentImport: unknown,
  expectedPath: string,
) {
  const response = await context.http
    .post(`/api/v1/projects/${projectId}/document-imports/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ documentImport })
    .expect(400);
  expect(response.body.requestId).toEqual(expect.any(String));
  expect(response.body.metadata.errors).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: expectedPath })]),
  );
}
