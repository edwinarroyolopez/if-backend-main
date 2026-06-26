import {
  loginNativeUser,
  registerAndBootstrapOrganization,
  type TestContext,
} from '../app-test-context';

type SprintBacklogStatus = 'READY' | 'UNREFINED';

export async function createSprintBacklogFixtures(
  context: TestContext,
  accessToken: string,
  projectId: string,
  otherProjectId: string,
) {
  const readyOne = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'ready-one',
    'READY',
  );
  const readyTwo = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'ready-two',
    'READY',
  );
  const readyThree = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'ready-three',
    'READY',
  );
  const unrefined = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'unrefined',
    'UNREFINED',
  );
  const archivedSource = await createSprintBacklogItem(
    context,
    accessToken,
    projectId,
    'archived',
    'READY',
  );
  const archived = await context.http
    .post(
      `/api/v1/projects/${projectId}/backlog/${archivedSource.id as string}/archive`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ expectedVersion: archivedSource.version as number })
    .expect(201);
  const otherProjectBacklog = await createSprintBacklogItem(
    context,
    accessToken,
    otherProjectId,
    'other-project-ready',
    'READY',
  );

  return {
    readyOne,
    readyTwo,
    readyThree,
    unrefined,
    archived: archived.body as Record<string, unknown>,
    otherProjectBacklog,
  };
}

export async function createSprintBacklogItem(
  context: TestContext,
  accessToken: string,
  projectId: string,
  key: string,
  status: SprintBacklogStatus,
) {
  const response = await context.http
    .post(`/api/v1/projects/${projectId}/backlog`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', `sprint-backlog-${projectId}-${key}`)
    .send({
      roadmapId: `roadmap-${projectId}`,
      roadmapVersionId: `roadmap-version-${projectId}`,
      milestoneId: `milestone-${projectId}`,
      milestoneKey: 'm1',
      milestoneTitle: 'Milestone Sprint',
      epicId: `epic-${projectId}`,
      epicKey: 'e1',
      epicTitle: 'Epic Sprint',
      title: `Backlog ${key}`,
      description: `Backlog item ${key}`,
      type: 'STORY',
      priority: 1,
      estimate: { unit: 'POINTS', value: 3 },
      status,
      acceptanceCriteria: ['Selectable in sprint when ready'],
      sourceReferences: [],
      traceability: {
        roadmapId: `roadmap-${projectId}`,
        roadmapVersionId: `roadmap-version-${projectId}`,
      },
    })
    .expect(201);
  return response.body as Record<string, unknown>;
}

export async function expectSprintAccessRestrictions(
  context: TestContext,
  input: {
    ownerEmail: string;
    organizationId: string;
    projectId: string;
    sprintId: string;
    secondSprintId: string;
    readyOneId: string;
    readyThreeId: string;
    doneItem: Record<string, unknown>;
  },
) {
  const secondOrg = await registerAndBootstrapOrganization(
    context,
    'project-sprints-cross-org',
  );
  await context.http
    .get(`/api/v1/projects/${input.projectId}/sprints`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .get(`/api/v1/projects/${input.projectId}/sprints/${input.sprintId}`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${input.projectId}/sprints`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'sprint-cross-create')
    .send({ name: 'Cross sprint' })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/add-items`,
    )
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'sprint-cross-add')
    .send({ backlogItemIds: [input.readyOneId] })
    .expect(403);
  for (const action of ['start', 'complete', 'cancel']) {
    await context.http
      .post(
        `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/${action}`,
      )
      .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
      .set('Idempotency-Key', `sprint-cross-${action}`)
      .expect(403);
  }
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/board-move`,
    )
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({
      itemId: input.doneItem.id as string,
      toStatus: 'BLOCKED',
      order: 0,
      expectedVersion: input.doneItem.version as number,
    })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/remove-item`,
    )
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'sprint-cross-remove')
    .send({
      itemId: input.doneItem.id as string,
      expectedVersion: input.doneItem.version as number,
    })
    .expect(403);

  const readOnlyLogin = await loginNativeUser(context, {
    email: input.ownerEmail,
    password: 'OwnerPassword123!',
    activeOrganizationId: input.organizationId,
  });
  await context.models.authSessions.updateOne(
    { _id: readOnlyLogin.body.sessionId as string },
    { $set: { readOnly: true } },
  );
  const readOnlyToken = readOnlyLogin.body.accessToken as string;
  await context.http
    .get(`/api/v1/projects/${input.projectId}/sprints`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .expect(200);
  await context.http
    .get(`/api/v1/projects/${input.projectId}/sprints/${input.sprintId}`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .expect(200);
  await context.http
    .post(`/api/v1/projects/${input.projectId}/sprints`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-create')
    .send({ name: 'Read only sprint' })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.secondSprintId}/add-items`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-add')
    .send({ backlogItemIds: [input.readyThreeId] })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.secondSprintId}/start`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-start')
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/board-move`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .send({
      itemId: input.doneItem.id as string,
      toStatus: 'BLOCKED',
      order: 0,
      expectedVersion: input.doneItem.version as number,
    })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/remove-item`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-remove')
    .send({
      itemId: input.doneItem.id as string,
      expectedVersion: input.doneItem.version as number,
    })
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.sprintId}/complete`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-complete')
    .expect(403);
  await context.http
    .post(
      `/api/v1/projects/${input.projectId}/sprints/${input.secondSprintId}/cancel`,
    )
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'sprint-readonly-cancel')
    .expect(403);
}

export async function expectSprintAuditActions(
  context: TestContext,
  organizationId: string,
) {
  for (const action of [
    'projects.sprint.create',
    'projects.sprint.add_items',
    'projects.sprint.remove_item',
    'projects.sprint.start',
    'projects.sprint.board_move',
    'projects.sprint.complete',
    'projects.sprint.cancel',
  ]) {
    const audit = await context.models.auditLogs.findOne({
      organizationId,
      action,
    });
    expect(audit).toBeTruthy();
  }
}
