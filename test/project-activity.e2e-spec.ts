import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';
import { validProjectDocumentImport } from './fixtures/project-document-imports';
import {
  expectActivityAccessRestrictions,
  expectActivityReadModel,
  buildActivityRoadmapImport,
  createReadyBacklogItem,
} from './helpers/project-activity-helpers';

jest.setTimeout(40000);

describe('Project activity', () => {
  it('maps project audit logs into a safe readable timeline', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'project-activity');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'activity-a',
      );
      const project = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const manualPage = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-doc-page-create')
        .send({
          title: 'Actividad aprobable',
          summary: 'Pagina para activity.',
          bodyMarkdown: 'Contenido no debe exponerse como metadata activity.',
          facts: ['Fact activity'],
        })
        .expect(201);
      const documentImport = validProjectDocumentImport(
        project.body.name as string,
        project.body.key as string,
      );
      const importPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ documentImport })
        .expect(201);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-doc-import')
        .send({
          documentImport,
          previewToken: importPreview.body.previewToken as string,
        })
        .expect(201);
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${manualPage.body.id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 1, summary: 'Pagina actualizada.' })
        .expect(200);
      const submittedPage = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${manualPage.body.id as string}/submit-review`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 2 })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${manualPage.body.id as string}/approve`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-doc-approve')
        .send({ expectedVersion: submittedPage.body.version as number })
        .expect(201);
      const archivePage = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/document-pages`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-doc-archive-source')
        .send({ title: 'Pagina a archivar', summary: 'Temporal' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/document-pages/${archivePage.body.id as string}/archive`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: archivePage.body.version as number })
        .expect(201);

      const snapshot = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/context-snapshots`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-snapshot')
        .expect(201);
      const roadmapImport = buildActivityRoadmapImport(snapshot.body);
      const roadmapPreview = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/preview`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roadmapImport })
        .expect(201);
      const roadmap = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/roadmap-imports/commit`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-roadmap-import')
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
      const backlogCommit = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-backlog-import')
        .send({ previewToken: backlogPreview.body.previewToken as string })
        .expect(201);
      const backlogOne = backlogCommit.body.items[0];
      const backlogTwo = backlogCommit.body.items[1];
      const readyBacklog = await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${backlogOne.id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: backlogOne.version as number,
          status: 'READY',
        })
        .expect(200);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog/reorder`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-backlog-reorder')
        .send({
          items: [
            {
              id: readyBacklog.body.id as string,
              order: 1,
              expectedVersion: readyBacklog.body.version as number,
            },
            {
              id: backlogTwo.id as string,
              order: 0,
              expectedVersion: backlogTwo.version as number,
            },
          ],
        })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/${backlogTwo.id as string}/archive`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 2 })
        .expect(201);

      const sprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-create')
        .send({ name: 'Sprint Activity', goal: 'Timeline visible' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-add')
        .send({ backlogItemIds: [readyBacklog.body.id] })
        .expect(201);
      const activeSprint = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-start')
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/board-move`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          itemId: activeSprint.body.items[0].id as string,
          toStatus: 'DONE',
          order: 0,
          expectedVersion: activeSprint.body.items[0].version as number,
        })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/complete`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-complete')
        .expect(201);
      const cancelBacklog = await createReadyBacklogItem(
        context,
        ownerAccessToken,
        fixtures.projectId,
        readyBacklog.body,
      );
      const cancelSprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-cancel-create')
        .send({ name: 'Sprint Cancel Activity' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${cancelSprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-cancel-add')
        .send({ backlogItemIds: [cancelBacklog.id] })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${cancelSprint.body.id as string}/cancel`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'activity-sprint-cancel')
        .expect(201);

      await expectActivityReadModel({
        context,
        accessToken: ownerAccessToken,
        organizationId,
        projectId: fixtures.projectId,
      });
      await expectActivityAccessRestrictions({
        context,
        ownerEmail,
        organizationId,
        projectId: fixtures.projectId,
        ownerAccessToken,
      });
    } finally {
      await context.close();
    }
  });
});
