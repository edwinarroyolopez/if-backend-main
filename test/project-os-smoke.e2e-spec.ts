import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';
import {
  invalidSchemaVersionImport,
  validProjectDocumentImport,
} from './fixtures/project-document-imports';

jest.setTimeout(60000);

describe('Project OS product smoke', () => {
  it('runs the full Project OS flow to READY_TO_START', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId } =
        await registerAndBootstrapOrganization(context, 'project-os-smoke');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'os-smoke',
      );

      const project = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const initialReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(initialReadiness.body.status).not.toBe('READY_TO_START');

      const documentationPrompt = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/prompts/documentation-interview`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(documentationPrompt.body.promptTemplateVersion).toBe(
        'project-documentation-interview-v1',
      );
      expect(documentationPrompt.body.contractVersion).toBe(
        'inflight.project.documentation.v1',
      );

      const documentImport = validProjectDocumentImport(
        project.body.name as string,
        project.body.key as string,
      );
      const invalidDocumentPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          documentImport: invalidSchemaVersionImport(
            project.body.name as string,
            project.body.key as string,
          ),
        })
        .expect(400);
      expect(invalidDocumentPreview.body.requestId).toBeTruthy();

      const documentPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ documentImport })
        .expect(201);
      expect(documentPreview.body.valid).toBe(true);
      expect(documentPreview.body.summary.pagesToCreate).toBe(2);
      const pagesBeforeCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(pagesBeforeCommit.body.items).toHaveLength(0);

      const documentCommit = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-doc-import')
        .send({
          documentImport,
          previewToken: documentPreview.body.previewToken as string,
        })
        .expect(201);
      expect(documentCommit.body.summary.pagesCreated).toBe(2);
      const documentCommitRetry = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-doc-import')
        .send({
          documentImport,
          previewToken: documentPreview.body.previewToken as string,
        })
        .expect(201);
      expect(documentCommitRetry.body.summary.pagesCreated).toBe(2);
      const pagesAfterCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(pagesAfterCommit.body.items).toHaveLength(2);

      for (const page of pagesAfterCommit.body.items as Array<{
        id: string;
        version: number;
      }>) {
        const submitted = await context.http
          .post(
            `/api/v1/projects/${fixtures.projectId}/document-pages/${page.id}/submit-review`,
          )
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .send({ expectedVersion: page.version })
          .expect(201);
        await context.http
          .post(
            `/api/v1/projects/${fixtures.projectId}/document-pages/${page.id}/approve`,
          )
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', `smoke-doc-approve-${page.id}`)
          .send({ expectedVersion: submitted.body.version as number })
          .expect(201);
      }

      const snapshot = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-context-snapshot')
        .expect(201);
      expect(snapshot.body.snapshotKey).toBeTruthy();
      expect(snapshot.body.approvedDocumentationHash).toBeTruthy();

      const roadmapPrompt = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/prompts/roadmap`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ snapshotId: snapshot.body.id as string })
        .expect(201);
      expect(roadmapPrompt.body.promptTemplateVersion).toBe(
        'project-roadmap-generation-v1',
      );
      expect(roadmapPrompt.body.contractVersion).toBe(
        'inflight.project.roadmap.v1',
      );

      const roadmapImport = buildRoadmapImport(snapshot.body);
      const invalidRoadmapPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          roadmapImport: {
            ...roadmapImport,
            schemaVersion: 'inflight.project.roadmap.invalid',
          },
        })
        .expect(400);
      expect(invalidRoadmapPreview.body.requestId).toBeTruthy();

      const roadmapPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roadmapImport })
        .expect(201);
      expect(roadmapPreview.body.summary.backlogCandidates).toBe(2);
      const roadmapsBeforeCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/roadmaps`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(roadmapsBeforeCommit.body.items).toHaveLength(0);

      const roadmap = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-roadmap-import')
        .send({
          roadmapImport,
          previewToken: roadmapPreview.body.previewToken as string,
        })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/roadmaps/${roadmap.body.id as string}/activate`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);

      const backlogPreview = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/preview`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(backlogPreview.body.summary.willCreate).toBe(2);
      const backlogBeforeCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(backlogBeforeCommit.body.items).toHaveLength(0);
      const backlogCommit = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-backlog-import')
        .send({ previewToken: backlogPreview.body.previewToken as string })
        .expect(201);
      expect(backlogCommit.body.summary.created).toBe(2);
      const backlogCommitRetry = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-backlog-import')
        .send({ previewToken: backlogPreview.body.previewToken as string })
        .expect(201);
      expect(backlogCommitRetry.body.summary.created).toBe(2);

      const backlogItem = backlogCommit.body.items[0] as {
        id: string;
        version: number;
      };
      const readyBacklog = await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${backlogItem.id}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: backlogItem.version,
          priority: 5,
          status: 'READY',
        })
        .expect(200);
      expect(readyBacklog.body.status).toBe('READY');

      const sprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-sprint-create')
        .send({ name: 'Sprint Smoke', goal: 'Validar smoke end-to-end' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-sprint-add')
        .send({ backlogItemIds: [readyBacklog.body.id] })
        .expect(201);
      const activeSprint = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-sprint-start')
        .expect(201);
      const sprintItem = activeSprint.body.items[0] as {
        id: string;
        version: number;
      };
      const movedSprint = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/board-move`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          itemId: sprintItem.id,
          toStatus: 'DONE',
          order: 0,
          expectedVersion: sprintItem.version,
        })
        .expect(201);
      expect(movedSprint.body.items[0].boardStatus).toBe('DONE');
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/complete`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-sprint-complete')
        .expect(201);

      const teamMember = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'smoke-team-create')
        .send({
          displayName: 'Loop Eleven Lead',
          email: 'loop11@test.dev',
          role: 'PROJECT_LEAD',
          capacity: 32,
          status: 'ACTIVE',
        })
        .expect(201);
      expect(teamMember.body.capacityUnit).toBe('HOURS_PER_WEEK');

      const finalReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(finalReadiness.body.status).toBe('READY_TO_START');
      expect(finalReadiness.body.completedSignals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MINIMUM_TEAM_READY' }),
          expect.objectContaining({ code: 'SCRUM_READY' }),
          expect.objectContaining({ code: 'CONTEXT_SNAPSHOT_READY' }),
        ]),
      );

      const activity = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity?limit=80`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const activityTypes = activity.body.items.map(
        (event: { type: string }) => event.type,
      );
      expect(activityTypes).toEqual(
        expect.arrayContaining([
          'PROJECT_CREATED',
          'DOCUMENTATION_IMPORTED',
          'DOCUMENT_PAGE_APPROVED',
          'CONTEXT_SNAPSHOT_CREATED',
          'ROADMAP_IMPORTED',
          'ROADMAP_ACTIVATED',
          'BACKLOG_IMPORTED',
          'BACKLOG_ITEM_UPDATED',
          'SPRINT_CREATED',
          'SPRINT_ITEMS_ADDED',
          'SPRINT_STARTED',
          'SPRINT_BOARD_MOVED',
          'SPRINT_COMPLETED',
          'TEAM_MEMBER_CREATED',
        ]),
      );

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'project-os-smoke-cross-org',
      );
      const crossOrg = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      expect(crossOrg.body.requestId).toBeTruthy();
    } finally {
      await context.close();
    }
  });
});

function buildRoadmapImport(snapshot: Record<string, unknown>) {
  const snapshotId = snapshot.id as string;
  const snapshotKey = snapshot.snapshotKey as string;
  const snapshotHash = snapshot.approvedDocumentationHash as string;
  const sourceReferences = [
    {
      referenceType: 'SNAPSHOT',
      referenceId: snapshotId,
      referenceKey: snapshotKey,
    },
  ];
  return {
    schemaVersion: 'inflight.project.roadmap.v1',
    generationStatus: 'READY',
    promptMetadata: {
      promptPurpose: 'PROJECT_ROADMAP_GENERATION',
      promptTemplateVersion: 'project-roadmap-generation-v1',
      contractVersion: 'inflight.project.roadmap.v1',
    },
    snapshotReference: { snapshotId, snapshotKey, snapshotHash },
    roadmap: {
      title: 'Roadmap Smoke',
      versionLabel: 'v1',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      planningAssumptions: [
        { key: 'assumption-1', statement: 'Smoke E2E listo', sourceReferences },
      ],
      constraints: [
        {
          key: 'constraint-1',
          statement: 'Sin proveedor IA',
          sourceReferences,
        },
      ],
    },
    horizons: [
      {
        key: 'h1',
        label: 'Smoke Horizon',
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        objective: 'Validar Project OS completo',
        sourceReferences,
      },
    ],
    milestones: [
      {
        key: 'm1',
        horizonKey: 'h1',
        title: 'Smoke Milestone',
        objective: 'Preparar producto',
        targetDate: '2026-08-01',
        status: 'PLANNED',
        order: 0,
        dependencies: [],
        sourceReferences,
      },
    ],
    epics: [
      {
        key: 'e1',
        milestoneKey: 'm1',
        title: 'Smoke Epic',
        objective: 'Conectar superficie primaria',
        expectedOutcome: 'Smoke con persistencia',
        priority: 1,
        status: 'PLANNED',
        order: 0,
        estimate: { unit: 'POINTS', value: 8 },
        dependencies: [],
        sourceReferences,
      },
    ],
    backlogCandidates: [
      {
        key: 'smoke-candidate-1',
        epicKey: 'e1',
        title: 'Smoke backlog principal',
        type: 'STORY',
        description: 'Permite probar sprint real.',
        priority: 1,
        estimate: { unit: 'T_SHIRT', value: 'M' },
        acceptanceCriteria: ['Sprint real visible'],
        sourceReferences,
      },
      {
        key: 'smoke-candidate-2',
        epicKey: 'e1',
        title: 'Smoke backlog secundario',
        type: 'TASK',
        description: 'Permite probar dedupe de backlog.',
        priority: 2,
        estimate: { unit: 'T_SHIRT', value: 'S' },
        acceptanceCriteria: ['Backlog idempotente'],
        sourceReferences,
      },
    ],
  };
}
