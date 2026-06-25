import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';
import { validProjectDocumentImport } from './fixtures/project-document-imports';
import {
  buildActivityRoadmapImport,
  createReadyBacklogItem,
  isSortedNewestFirst,
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

      const auditCountBeforeRead =
        await context.models.auditLogs.countDocuments({
          organizationId,
        });
      const activity = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity?limit=50`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const auditCountAfterRead = await context.models.auditLogs.countDocuments(
        {
          organizationId,
        },
      );
      expect(auditCountAfterRead).toBe(auditCountBeforeRead);
      const types = activity.body.items.map(
        (event: { type: string }) => event.type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'PROJECT_CREATED',
          'DOCUMENTATION_IMPORTED',
          'DOCUMENT_PAGE_CREATED',
          'DOCUMENT_PAGE_UPDATED',
          'DOCUMENT_PAGE_SUBMITTED',
          'DOCUMENT_PAGE_APPROVED',
          'DOCUMENT_PAGE_ARCHIVED',
          'CONTEXT_SNAPSHOT_CREATED',
          'ROADMAP_IMPORTED',
          'ROADMAP_ACTIVATED',
          'BACKLOG_IMPORTED',
          'BACKLOG_ITEM_UPDATED',
          'BACKLOG_REORDERED',
          'BACKLOG_ITEM_ARCHIVED',
          'SPRINT_CREATED',
          'SPRINT_ITEMS_ADDED',
          'SPRINT_STARTED',
          'SPRINT_BOARD_MOVED',
          'SPRINT_COMPLETED',
          'SPRINT_CANCELLED',
        ]),
      );
      expect(isSortedNewestFirst(activity.body.items)).toBe(true);
      const serialized = JSON.stringify(activity.body.items);
      expect(serialized).not.toMatch(
        /OwnerPassword|token|secret|cookie|bodyMarkdown|stack/i,
      );
      expect(activity.body.items[0].actor.id).toBeTruthy();
      expect(activity.body.items[0].occurredAt).toBeTruthy();
      expect(
        activity.body.items.some(
          (event: { resource: { href?: string } }) =>
            event.resource.href === `/projects/${fixtures.projectId}/scrum`,
        ),
      ).toBe(true);
      expect(
        activity.body.items.some(
          (event: { resource: { href?: string } }) =>
            event.resource.href === `/projects/${fixtures.projectId}/roadmap`,
        ),
      ).toBe(true);
      expect(
        activity.body.items.some(
          (event: { resource: { href?: string } }) =>
            event.resource.href === `/projects/${fixtures.projectId}/backlog`,
        ),
      ).toBe(true);

      const docFiltered = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/activity?type=DOCUMENT_PAGE_APPROVED`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(docFiltered.body.items).toHaveLength(1);
      expect(docFiltered.body.items[0].type).toBe('DOCUMENT_PAGE_APPROVED');

      const roadmapFiltered = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/activity?resourceKind=ROADMAP`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        roadmapFiltered.body.items.every(
          (event: { resource: { kind: string } }) =>
            event.resource.kind === 'ROADMAP',
        ),
      ).toBe(true);

      const empty = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/activity?type=NO_SUCH_EVENT`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(empty.body.items).toHaveLength(0);

      const firstPage = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity?limit=2`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.nextCursor).toBeTruthy();
      const secondPage = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/activity?limit=2&cursor=${firstPage.body.nextCursor as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'project-activity-cross-org',
      );
      const crossOrg = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      expect(crossOrg.body.requestId).toBeTruthy();

      const roleResponse = await context.http
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          key: 'ACTIVITY_NO_READ',
          name: 'Activity no read',
        })
        .expect(201);
      const userResponse = await context.http
        .post('/api/v1/auth/native/register')
        .send({
          email: 'activity-no-read@test.dev',
          displayName: 'Activity No Read',
          password: 'ActivityNoRead123!',
        })
        .expect(201);
      await context.http
        .post('/api/v1/role-assignments')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          principalId: userResponse.body.user.id as string,
          roleId: roleResponse.body.id as string,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        })
        .expect(201);
      const noReadLogin = await context.http
        .post('/api/v1/auth/native/login')
        .send({
          email: 'activity-no-read@test.dev',
          password: 'ActivityNoRead123!',
          activeOrganizationId: organizationId,
        })
        .expect(201);
      const noRead = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/activity`)
        .set(
          'Authorization',
          `Bearer ${noReadLogin.body.accessToken as string}`,
        )
        .expect(403);
      expect(noRead.body.requestId).toBeTruthy();

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
        .get(`/api/v1/projects/${fixtures.projectId}/activity?limit=1`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .expect(200);
    } finally {
      await context.close();
    }
  });
});
