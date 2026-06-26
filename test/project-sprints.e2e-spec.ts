import {
  createOperationalFixtures,
  createTestContext,
  registerAndBootstrapOrganization,
} from './app-test-context';
import {
  createSprintBacklogFixtures,
  createSprintBacklogItem,
  expectSprintAuditActions,
  expectSprintAccessRestrictions,
} from './helpers/project-sprint-fixtures';
import {
  expectSprintBoardAndCompletionFlow,
  expectSprintCancellationFlow,
} from './helpers/project-sprint-board-flow';

jest.setTimeout(30000);

describe('Project sprints', () => {
  it('plans, starts, moves and finishes sprint items from real backlog', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'project-sprints');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'sprint-a',
      );
      const otherProjectFixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'sprint-b',
      );

      const {
        readyOne,
        readyTwo,
        readyThree,
        unrefined,
        archived,
        otherProjectBacklog,
      } = await createSprintBacklogFixtures(
        context,
        ownerAccessToken,
        fixtures.projectId,
        otherProjectFixtures.projectId,
      );

      const sprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-main')
        .send({
          name: 'Sprint Loop 8',
          goal: 'Conectar board real',
          startDate: '2026-07-06',
          endDate: '2026-07-17',
        })
        .expect(201);
      expect(sprint.body.status).toBe('PLANNING');

      const list = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(list.body.items).toHaveLength(1);

      const emptySprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-empty')
        .send({ name: 'Sprint Empty' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${emptySprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-empty-start')
        .expect(409);

      for (const blocked of [unrefined, archived, otherProjectBacklog]) {
        await context.http
          .post(
            `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/add-items`,
          )
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .set('Idempotency-Key', `sprint-add-blocked-${blocked.id as string}`)
          .send({ backlogItemIds: [blocked.id] })
          .expect(blocked.id === otherProjectBacklog.id ? 404 : 409);
      }

      const planned = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-ready')
        .send({ backlogItemIds: [readyOne.id, readyTwo.id] })
        .expect(201);
      expect(planned.body.items).toHaveLength(2);
      expect(planned.body.items[0].boardStatus).toBe('TO_DO');

      const repeatedAdd = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-ready')
        .send({ backlogItemIds: [readyOne.id, readyTwo.id] })
        .expect(201);
      expect(repeatedAdd.body.items).toHaveLength(2);
      const selectedBacklog = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        selectedBacklog.body.items.find(
          (item: { id: string }) => item.id === readyOne.id,
        ).status,
      ).toBe('SELECTED_FOR_SPRINT');

      const selectedRejectSprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-selected-reject')
        .send({ name: 'Sprint Selected Reject' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${selectedRejectSprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-selected-reject')
        .send({ backlogItemIds: [readyOne.id] })
        .expect(409);

      const removeSprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-remove')
        .send({ name: 'Sprint Remove Item' })
        .expect(201);
      const removeBacklog = await createSprintBacklogItem(
        context,
        ownerAccessToken,
        fixtures.projectId,
        'remove-ready',
        'READY',
      );
      const removePlanned = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${removeSprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-remove')
        .send({ backlogItemIds: [removeBacklog.id] })
        .expect(201);
      const removed = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${removeSprint.body.id as string}/remove-item`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-remove-item')
        .send({
          itemId: removePlanned.body.items[0].id as string,
          expectedVersion: removePlanned.body.items[0].version as number,
        })
        .expect(201);
      expect(removed.body.items).toHaveLength(0);
      const releasedBacklog = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        releasedBacklog.body.items.find(
          (item: { id: string }) => item.id === removeBacklog.id,
        ).status,
      ).toBe('READY');

      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/board-move`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          itemId: planned.body.items[0].id as string,
          toStatus: 'IN_PROGRESS',
          order: 0,
          expectedVersion: planned.body.items[0].version as number,
        })
        .expect(409);

      const active = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${sprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-start-main')
        .expect(201);
      expect(active.body.status).toBe('ACTIVE');
      expect(active.body.active).toBe(true);

      const secondSprint = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-second')
        .send({ name: 'Sprint Second Active' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${secondSprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-second')
        .send({ backlogItemIds: [readyThree.id] })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/sprints/${secondSprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-start-second')
        .expect(409);

      const otherProjectSprint = await context.http
        .post(`/api/v1/projects/${otherProjectFixtures.projectId}/sprints`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-create-other-project')
        .send({ name: 'Sprint Other Project' })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${otherProjectFixtures.projectId}/sprints/${otherProjectSprint.body.id as string}/add-items`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-add-other-project')
        .send({ backlogItemIds: [otherProjectBacklog.id] })
        .expect(201);
      await context.http
        .post(
          `/api/v1/projects/${otherProjectFixtures.projectId}/sprints/${otherProjectSprint.body.id as string}/start`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'sprint-start-other-project')
        .expect(201);

      const doneItem = await expectSprintBoardAndCompletionFlow({
        context,
        accessToken: ownerAccessToken,
        projectId: fixtures.projectId,
        sprintId: sprint.body.id as string,
        activeSprint: active.body,
      });

      await expectSprintCancellationFlow({
        context,
        accessToken: ownerAccessToken,
        projectId: fixtures.projectId,
      });

      await expectSprintAccessRestrictions(context, {
        ownerEmail,
        organizationId,
        projectId: fixtures.projectId,
        sprintId: sprint.body.id as string,
        secondSprintId: secondSprint.body.id as string,
        readyOneId: readyOne.id as string,
        readyThreeId: readyThree.id as string,
        doneItem,
      });

      await expectSprintAuditActions(context, organizationId);
    } finally {
      await context.close();
    }
  });
});
