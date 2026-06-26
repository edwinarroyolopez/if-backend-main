import {
  loginNativeUser,
  registerAndBootstrapOrganization,
  type TestContext,
} from '../app-test-context';
import { buildRoadmapImport } from './project-roadmap-import-builder';

export function buildActivityRoadmapImport(snapshot: Record<string, unknown>) {
  return buildRoadmapImport(snapshot, {
    title: 'Roadmap Activity',
    assumptionStatement: 'Plan activity',
    constraintStatement: 'Usar snapshot',
    horizonLabel: 'Fase Activity',
    horizonObjective: 'Entregar trazabilidad',
    milestoneTitle: 'Base Activity',
    milestoneObjective: 'Activar timeline',
    epicTitle: 'Epic Activity',
    epicObjective: 'Preparar trazabilidad',
    epicOutcome: 'Timeline visible',
    backlogCandidates: [
      {
        key: 'b1',
        type: 'STORY',
        title: 'Ver timeline',
        description: 'Como usuario veo activity.',
        priority: 1,
        estimate: { unit: 'POINTS', value: 5 },
        acceptanceCriteria: ['Activity visible'],
      },
      {
        key: 'b2',
        type: 'TASK',
        title: 'Archivar backlog',
        description: 'Evento backlog archive.',
        priority: 2,
        estimate: { unit: 'POINTS', value: 2 },
        acceptanceCriteria: ['Archive visible'],
      },
    ],
  });
}

export async function createReadyBacklogItem(
  context: TestContext,
  accessToken: string,
  projectId: string,
  source: Record<string, unknown>,
) {
  const response = await context.http
    .post(`/api/v1/projects/${projectId}/backlog`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'activity-backlog-cancel-source')
    .send({
      roadmapId: source.roadmapId,
      roadmapVersionId: source.roadmapVersionId,
      milestoneId: source.milestoneId,
      milestoneKey: source.milestoneKey,
      milestoneTitle: source.milestoneTitle,
      epicId: source.epicId,
      epicKey: source.epicKey,
      epicTitle: source.epicTitle,
      title: 'Backlog cancel sprint',
      description: 'Item para cancel activity.',
      type: 'TASK',
      priority: 3,
      estimate: { unit: 'POINTS', value: 1 },
      status: 'READY',
      sourceReferences: source.sourceReferences,
      traceability: source.traceability,
    })
    .expect(201);
  return response.body as Record<string, unknown>;
}

export function isSortedNewestFirst(
  items: Array<{ occurredAt: string; id: string }>,
) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (!previous || !current) continue;
    if (previous.occurredAt < current.occurredAt) return false;
    if (
      previous.occurredAt === current.occurredAt &&
      previous.id < current.id
    ) {
      return false;
    }
  }
  return true;
}

export async function expectActivityReadModel(input: {
  context: TestContext;
  accessToken: string;
  organizationId: string;
  projectId: string;
}) {
  const { context, accessToken, organizationId, projectId } = input;
  const auditCountBeforeRead = await context.models.auditLogs.countDocuments({
    organizationId,
  });
  const activity = await context.http
    .get(`/api/v1/projects/${projectId}/activity?limit=50`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const auditCountAfterRead = await context.models.auditLogs.countDocuments({
    organizationId,
  });
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
  expect(
    isSortedNewestFirst(
      activity.body.items as unknown as Array<{
        occurredAt: string;
        id: string;
      }>,
    ),
  ).toBe(true);
  const serialized = JSON.stringify(activity.body.items);
  expect(serialized).not.toMatch(
    /OwnerPassword|token|secret|cookie|bodyMarkdown|stack/i,
  );
  expect(activity.body.items[0].actor.id).toBeTruthy();
  expect(activity.body.items[0].occurredAt).toBeTruthy();
  for (const href of [
    `/projects/${projectId}/scrum`,
    `/projects/${projectId}/roadmap`,
    `/projects/${projectId}/backlog`,
  ]) {
    expect(
      activity.body.items.some(
        (event: { resource: { href?: string } }) =>
          event.resource.href === href,
      ),
    ).toBe(true);
  }

  const docFiltered = await context.http
    .get(`/api/v1/projects/${projectId}/activity?type=DOCUMENT_PAGE_APPROVED`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(docFiltered.body.items).toHaveLength(1);
  expect(docFiltered.body.items[0].type).toBe('DOCUMENT_PAGE_APPROVED');

  const roadmapFiltered = await context.http
    .get(`/api/v1/projects/${projectId}/activity?resourceKind=ROADMAP`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(
    roadmapFiltered.body.items.every(
      (event: { resource: { kind: string } }) =>
        event.resource.kind === 'ROADMAP',
    ),
  ).toBe(true);

  const empty = await context.http
    .get(`/api/v1/projects/${projectId}/activity?type=NO_SUCH_EVENT`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(empty.body.items).toHaveLength(0);

  const firstPage = await context.http
    .get(`/api/v1/projects/${projectId}/activity?limit=2`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(firstPage.body.items).toHaveLength(2);
  expect(firstPage.body.nextCursor).toBeTruthy();
  const secondPage = await context.http
    .get(
      `/api/v1/projects/${projectId}/activity?limit=2&cursor=${firstPage.body.nextCursor as string}`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
}

export async function expectActivityAccessRestrictions(input: {
  context: TestContext;
  ownerEmail: string;
  organizationId: string;
  projectId: string;
  ownerAccessToken: string;
}) {
  const { context, ownerEmail, organizationId, projectId, ownerAccessToken } =
    input;
  const secondOrg = await registerAndBootstrapOrganization(
    context,
    'project-activity-cross-org',
  );
  const crossOrg = await context.http
    .get(`/api/v1/projects/${projectId}/activity`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  expect(crossOrg.body.requestId).toBeTruthy();

  const roleResponse = await context.http
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ organizationId, key: 'ACTIVITY_NO_READ', name: 'Activity no read' })
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
    .get(`/api/v1/projects/${projectId}/activity`)
    .set('Authorization', `Bearer ${noReadLogin.body.accessToken as string}`)
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
    .get(`/api/v1/projects/${projectId}/activity?limit=1`)
    .set('Authorization', `Bearer ${readOnlyLogin.body.accessToken as string}`)
    .expect(200);
}
