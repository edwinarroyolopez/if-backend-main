import {
  registerAndBootstrapOrganization,
  type TestContext,
} from '../app-test-context';

export async function expectSmokeFinalReadinessAndActivity(input: {
  context: TestContext;
  accessToken: string;
  projectId: string;
}) {
  const { context, accessToken, projectId } = input;
  const finalReadiness = await context.http
    .get(`/api/v1/projects/${projectId}/readiness`)
    .set('Authorization', `Bearer ${accessToken}`)
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
    .get(`/api/v1/projects/${projectId}/activity?limit=80`)
    .set('Authorization', `Bearer ${accessToken}`)
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
    .get(`/api/v1/projects/${projectId}/activity`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  expect(crossOrg.body.requestId).toBeTruthy();
}

export async function createSmokeTeamMember(input: {
  context: TestContext;
  accessToken: string;
  projectId: string;
}) {
  const teamMember = await input.context.http
    .post(`/api/v1/projects/${input.projectId}/team`)
    .set('Authorization', `Bearer ${input.accessToken}`)
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
}
