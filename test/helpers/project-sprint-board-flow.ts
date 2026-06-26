import { type TestContext } from '../app-test-context';
import { createSprintBacklogItem } from './project-sprint-fixtures';

export async function expectSprintBoardAndCompletionFlow(input: {
  context: TestContext;
  accessToken: string;
  projectId: string;
  sprintId: string;
  activeSprint: Record<string, unknown>;
}) {
  const { context, accessToken, projectId, sprintId, activeSprint } = input;
  const itemOne = (activeSprint.items as Array<Record<string, unknown>>)[0];
  const movedToProgress = await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/board-move`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      itemId: itemOne.id as string,
      toStatus: 'IN_PROGRESS',
      order: 0,
      expectedVersion: itemOne.version as number,
    })
    .expect(201);
  const progressItem = movedToProgress.body.items.find(
    (item: { id: string }) => item.id === itemOne.id,
  );
  expect(progressItem.boardStatus).toBe('IN_PROGRESS');
  await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/board-move`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      itemId: itemOne.id as string,
      toStatus: 'REVIEW',
      order: 0,
      expectedVersion: itemOne.version as number,
    })
    .expect(409);
  const movedToReview = await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/board-move`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      itemId: itemOne.id as string,
      toStatus: 'REVIEW',
      order: 0,
      expectedVersion: progressItem.version as number,
    })
    .expect(201);
  const reviewItem = movedToReview.body.items.find(
    (item: { id: string }) => item.id === itemOne.id,
  );
  const movedToDone = await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/board-move`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      itemId: itemOne.id as string,
      toStatus: 'DONE',
      order: 0,
      expectedVersion: reviewItem.version as number,
    })
    .expect(201);
  const doneItem = movedToDone.body.items.find(
    (item: { id: string }) => item.id === itemOne.id,
  );
  expect(doneItem.boardStatus).toBe('DONE');

  const todoItem = movedToDone.body.items.find(
    (item: { id: string }) => item.id !== itemOne.id,
  );
  const reorderedTodo = await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/board-move`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      itemId: todoItem.id,
      toStatus: 'TO_DO',
      order: 0,
      expectedVersion: todoItem.version as number,
    })
    .expect(201);
  expect(
    reorderedTodo.body.items.find(
      (item: { id: string }) => item.id === todoItem.id,
    ).order,
  ).toBe(0);

  const persisted = await context.http
    .get(`/api/v1/projects/${projectId}/sprints/${sprintId}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(
    persisted.body.items.find((item: { id: string }) => item.id === itemOne.id)
      .boardStatus,
  ).toBe('DONE');

  const completed = await context.http
    .post(`/api/v1/projects/${projectId}/sprints/${sprintId}/complete`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'sprint-complete-main')
    .expect(201);
  expect(completed.body.status).toBe('COMPLETED');
  expect(completed.body.active).toBe(false);
  return doneItem as Record<string, unknown>;
}

export async function expectSprintCancellationFlow(input: {
  context: TestContext;
  accessToken: string;
  projectId: string;
}) {
  const { context, accessToken, projectId } = input;
  const cancelSprint = await context.http
    .post(`/api/v1/projects/${projectId}/sprints`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'sprint-create-cancel')
    .send({ name: 'Sprint Cancel' })
    .expect(201);
  const cancelBacklog = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'cancel-ready',
    'READY',
  );
  await context.http
    .post(
      `/api/v1/projects/${projectId}/sprints/${cancelSprint.body.id as string}/add-items`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'sprint-add-cancel')
    .send({ backlogItemIds: [cancelBacklog.id] })
    .expect(201);
  const cancelled = await context.http
    .post(
      `/api/v1/projects/${projectId}/sprints/${cancelSprint.body.id as string}/cancel`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'sprint-cancel')
    .expect(201);
  expect(cancelled.body.status).toBe('CANCELLED');
}
