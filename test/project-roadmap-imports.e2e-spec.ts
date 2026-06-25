import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';
import { buildRoadmapImport } from './helpers/project-roadmap-import-builder';

describe('Project roadmap imports', () => {
  it('previews, commits and activates roadmap versions from immutable snapshots', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'roadmap-imports');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'roadmap-imports',
      );
      const page = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-doc-create')
        .send({
          title: 'Base roadmap aprobada',
          summary: 'Contexto aprobado para roadmap.',
          bodyMarkdown: 'Construir fase uno con trazabilidad.',
          facts: ['Fact roadmap'],
        })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${page.body.id as string}/submit-review`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 1 })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${page.body.id as string}/approve`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-doc-approve')
        .send({ expectedVersion: 2 })
        .expect(201);
      const snapshot = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-snapshot-create')
        .expect(201);

      const prompt = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/prompts/roadmap`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          snapshotId: snapshot.body.id as string,
          roadmapDraft: '# Roadmap draft\nUsar horizonte 30/90/180/365.',
        })
        .expect(201);
      expect(prompt.body.prompt).toContain(
        snapshot.body.approvedDocumentationHash,
      );
      expect(prompt.body.prompt).toContain('Approved source pages:');
      expect(prompt.body.prompt).toContain('Base roadmap aprobada');
      expect(prompt.body.prompt).toContain(
        'Construir fase uno con trazabilidad.',
      );
      expect(prompt.body.prompt).toContain(`pageId=${page.body.id as string}`);
      expect(prompt.body.prompt).toContain('pageVersion=3');
      expect(prompt.body.prompt).toContain('User roadmap draft:');
      expect(prompt.body.prompt).toContain('Usar horizonte 30/90/180/365.');

      const roadmapImport = buildRoadmapImport(snapshot.body);
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          snapshotReference: {
            ...roadmapImport.snapshotReference,
            snapshotId: '64f000000000000000000001',
          },
        },
        '$.snapshotReference.snapshotId',
      );
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          roadmap: { ...roadmapImport.roadmap, endDate: '2026-06-30' },
        },
        '$.roadmap.endDate',
      );
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          milestones: [
            {
              ...roadmapImport.milestones[0],
              dependencies: ['missing-milestone'],
            },
          ],
        },
        '$.milestones[m1].dependencies',
      );
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          epics: [
            { ...roadmapImport.epics[0], milestoneKey: 'missing-milestone' },
          ],
        },
        '$.epics[e1].milestoneKey',
      );
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          unexpected: true,
        },
        '$.unexpected',
      );
      await expectRoadmapImportInvalid(
        context,
        ownerAccessToken,
        fixtures.projectId,
        {
          ...roadmapImport,
          epics: [
            {
              ...roadmapImport.epics[0],
              estimate: { unit: 'BANANAS', value: -1 },
            },
          ],
        },
        '$.epics[e1].estimate',
      );
      const preview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roadmapImport })
        .expect(201);
      expect(preview.body.summary.milestones).toBe(1);
      const roadmapsBefore = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/roadmaps`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(roadmapsBefore.body.items).toHaveLength(0);

      const committed = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-import-commit')
        .send({
          roadmapImport,
          previewToken: preview.body.previewToken as string,
        })
        .expect(201);
      expect(committed.body.versions).toHaveLength(1);
      expect(committed.body.versions[0].milestones).toHaveLength(1);
      expect(committed.body.versions[0].epics).toHaveLength(1);

      const repeated = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-import-commit')
        .send({
          roadmapImport,
          previewToken: preview.body.previewToken as string,
        })
        .expect(201);
      expect(repeated.body.id).toBe(committed.body.id);
      expect(repeated.body.versions).toHaveLength(1);

      const repeatedDifferentKey = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-import-commit-repeat')
        .send({
          roadmapImport,
          previewToken: preview.body.previewToken as string,
        })
        .expect(201);
      expect(repeatedDifferentKey.body.id).toBe(committed.body.id);
      expect(repeatedDifferentKey.body.versions).toHaveLength(1);

      const activated = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/activate`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(activated.body.activeVersion.status).toBe('ACTIVE');

      const secondRoadmapImport = buildLargeRoadmapImport(snapshot.body);
      const secondPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roadmapImport: secondRoadmapImport })
        .expect(201);
      const secondCommitted = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-import-commit-v2')
        .send({
          roadmapImport: secondRoadmapImport,
          previewToken: secondPreview.body.previewToken as string,
        })
        .expect(201);
      expect(secondCommitted.body.versions).toHaveLength(2);
      expect(secondCommitted.body.versions[0].milestones).toHaveLength(5);
      expect(secondCommitted.body.versions[0].epics).toHaveLength(21);
      expect(secondCommitted.body.versions[0].backlogCandidates).toHaveLength(
        42,
      );
      const secondActivated = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/activate`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      const activeVersions = secondActivated.body.versions.filter(
        (version: { status: string }) => version.status === 'ACTIVE',
      );
      const supersededVersions = secondActivated.body.versions.filter(
        (version: { status: string }) => version.status === 'SUPERSEDED',
      );
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0].versionLabel).toBe('v2-large');
      expect(supersededVersions).toHaveLength(1);

      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          roadmapImport: {
            ...roadmapImport,
            milestones: [
              roadmapImport.milestones[0],
              { ...roadmapImport.milestones[0] },
            ],
          },
        })
        .expect(400);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'roadmap-imports-cross-org',
      );
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/roadmaps`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/prompts/roadmap`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ snapshotId: snapshot.body.id as string })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ roadmapImport })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .set('Idempotency-Key', 'roadmap-cross-org-commit')
        .send({
          roadmapImport,
          previewToken: preview.body.previewToken as string,
        })
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/activate`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/archive`,
        )
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
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .set('Idempotency-Key', 'roadmap-readonly-commit')
        .send({
          roadmapImport,
          previewToken: preview.body.previewToken as string,
        })
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/activate`,
        )
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/archive`,
        )
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .expect(403);

      const archived = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${committed.body.id as string}/archive`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(archived.body.status).toBe('ARCHIVED');
      expect(archived.body.versions).toHaveLength(2);
      expect(
        archived.body.versions.every(
          (version: { status: string }) => version.status === 'ARCHIVED',
        ),
      ).toBe(true);

      const audit = await context.models.auditLogs.findOne({
        organizationId,
        action: 'projects.roadmap.activate',
        resourceId: committed.body.id as string,
      });
      expect(audit).toBeTruthy();
      const importAudit = await context.models.auditLogs.findOne({
        organizationId,
        action: 'projects.roadmap.import_commit',
        resourceId: committed.body.id as string,
      });
      expect(importAudit).toBeTruthy();
      const archiveAudit = await context.models.auditLogs.findOne({
        organizationId,
        action: 'projects.roadmap.archive',
        resourceId: committed.body.id as string,
      });
      expect(archiveAudit).toBeTruthy();
    } finally {
      await context.close();
    }
  });
});

async function expectRoadmapImportInvalid(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
  projectId: string,
  roadmapImport: Record<string, unknown>,
  expectedPath: string,
) {
  const response = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ roadmapImport })
    .expect(400);
  expect(JSON.stringify(response.body.metadata)).toContain(expectedPath);
}

function buildLargeRoadmapImport(snapshot: Record<string, unknown>) {
  const roadmapImport = buildRoadmapImport(snapshot, {
    versionLabel: 'v2-large',
  });
  const sourceReferences = roadmapImport.horizons[0].sourceReferences;
  const horizons = Array.from({ length: 5 }, (_, index) => ({
    key: `h${index + 1}`,
    label: `Horizonte ${index + 1}`,
    startDate: '2026-07-01',
    endDate: '2027-07-25',
    objective: `Objetivo del horizonte ${index + 1}`,
    sourceReferences,
  }));
  const milestones = horizons.map((horizon, index) => ({
    key: `m${index + 1}`,
    horizonKey: horizon.key,
    title: `Milestone ${index + 1}`,
    objective: `Objetivo del milestone ${index + 1}`,
    targetDate: '2027-07-25',
    status: 'PLANNED',
    order: index,
    dependencies: index === 0 ? [] : [`m${index}`],
    sourceReferences,
  }));
  const epics = Array.from({ length: 21 }, (_, index) => ({
    key: `e${index + 1}`,
    milestoneKey: milestones[Math.min(Math.floor(index / 5), 4)].key,
    title: `Epic ${index + 1}`,
    objective: `Objetivo del epic ${index + 1}`,
    expectedOutcome: `Resultado del epic ${index + 1}`,
    priority: index + 1,
    status: 'PLANNED',
    order: index,
    estimate: { unit: 'T_SHIRT', value: index % 2 === 0 ? 'L' : 'XL' },
    dependencies: index === 0 ? [] : [`e${index}`],
    sourceReferences,
  }));
  const backlogCandidates = Array.from({ length: 42 }, (_, index) => ({
    key: `b${index + 1}`,
    epicKey: epics[Math.floor(index / 2)].key,
    type: index % 5 === 0 ? 'SPIKE' : 'STORY',
    title: `Backlog candidate ${index + 1}`,
    description: `Descripcion del candidato ${index + 1}`,
    priority: index + 1,
    estimate: { unit: 'T_SHIRT', value: index % 2 === 0 ? 'M' : 'L' },
    acceptanceCriteria: [`Criterio ${index + 1}`],
    dependencies: index === 0 ? [] : [`b${index}`],
    sourceReferences,
  }));

  return {
    ...roadmapImport,
    roadmap: {
      ...roadmapImport.roadmap,
      title: 'Roadmap grande',
      versionLabel: 'v2-large',
      endDate: '2027-07-25',
    },
    horizons,
    milestones,
    epics,
    backlogCandidates,
  };
}
