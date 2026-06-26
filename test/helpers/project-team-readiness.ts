import {
  loginNativeUser,
  registerAndBootstrapOrganization,
  registerNativeUser,
  type TestContext,
} from '../app-test-context';
import { buildRoadmapImport } from './project-roadmap-import-builder';

export async function prepareReadyProject(
  context: TestContext,
  accessToken: string,
  projectId: string,
) {
  const page = await context.http
    .post(`/api/v1/projects/${projectId}/document-pages`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-doc-create')
    .send({
      title: 'Base aprobada para team',
      summary: 'Documentacion util para readiness final.',
      bodyMarkdown: 'Contenido aprobado.',
      facts: ['Equipo requiere capacidad'],
    })
    .expect(201);
  const submitted = await context.http
    .post(
      `/api/v1/projects/${projectId}/document-pages/${page.body.id as string}/submit-review`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ expectedVersion: page.body.version as number })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/document-pages/${page.body.id as string}/approve`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-doc-approve')
    .send({ expectedVersion: submitted.body.version as number })
    .expect(201);
  const snapshot = await context.http
    .post(`/api/v1/projects/${projectId}/context-snapshots`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-snapshot')
    .expect(201);
  const roadmapImport = buildRoadmapImport(snapshot.body, {
    title: 'Roadmap Team',
    assumptionStatement: 'Team listo',
    constraintStatement: 'Capacidad definida',
    horizonLabel: 'Fase Team',
    horizonObjective: 'Cerrar readiness final',
    milestoneTitle: 'Team Ready',
    milestoneObjective: 'Preparar equipo',
    epicTitle: 'Epic Team',
    epicObjective: 'Conectar capacidad',
    epicOutcome: 'Proyecto listo para iniciar',
    backlogCandidates: [
      {
        key: 'b1',
        type: 'STORY',
        title: 'Preparar sprint con team',
        description: 'Como project lead asigno capacidad.',
        priority: 1,
        estimate: { unit: 'POINTS', value: 5 },
        acceptanceCriteria: ['Team desbloquea readiness'],
      },
    ],
  });
  const roadmapPreview = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ roadmapImport })
    .expect(201);
  const roadmap = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/commit`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-roadmap-import')
    .send({
      roadmapImport,
      previewToken: roadmapPreview.body.previewToken as string,
    })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/roadmaps/${roadmap.body.id as string}/activate`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
  const backlogPreview = await context.http
    .post(`/api/v1/projects/${projectId}/backlog/import-from-roadmap/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
  const backlogCommit = await context.http
    .post(`/api/v1/projects/${projectId}/backlog/import-from-roadmap/commit`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-backlog-import')
    .send({ previewToken: backlogPreview.body.previewToken as string })
    .expect(201);
  const backlogItem = backlogCommit.body.items[0];
  const readyBacklog = await context.http
    .patch(`/api/v1/projects/${projectId}/backlog/${backlogItem.id as string}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ expectedVersion: backlogItem.version as number, status: 'READY' })
    .expect(200);
  const sprint = await context.http
    .post(`/api/v1/projects/${projectId}/sprints`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-sprint-create')
    .send({ name: 'Sprint Team Ready', goal: 'Validar readiness final' })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/sprints/${sprint.body.id as string}/add-items`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-sprint-add')
    .send({ backlogItemIds: [readyBacklog.body.id] })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/sprints/${sprint.body.id as string}/start`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'team-sprint-start')
    .expect(201);
  return { sprintId: sprint.body.id as string };
}

export async function expectTeamAccessRestrictions(input: {
  context: TestContext;
  ownerAccessToken: string;
  ownerEmail: string;
  organizationId: string;
  projectId: string;
  activeMemberId: string;
  activeMemberVersion: number;
}) {
  const {
    context,
    ownerAccessToken,
    ownerEmail,
    organizationId,
    projectId,
    activeMemberId,
    activeMemberVersion,
  } = input;
  const secondOrg = await registerAndBootstrapOrganization(
    context,
    'project-team-cross-org',
  );
  await context.http
    .get(`/api/v1/projects/${projectId}/team`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/team`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'team-cross-create')
    .send({
      displayName: 'Cross Org',
      role: 'OBSERVER',
      capacity: 4,
      status: 'PLANNED',
    })
    .expect(403);
  await context.http
    .patch(`/api/v1/projects/${projectId}/team/${activeMemberId}`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ expectedVersion: activeMemberVersion, capacity: 8 })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/team/${activeMemberId}/deactivate`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ expectedVersion: activeMemberVersion })
    .expect(403);

  const readRole = await context.http
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ organizationId, key: 'TEAM_READ_ONLY_ROLE', name: 'Team Read' })
    .expect(201);
  await context.http
    .post(`/api/v1/roles/${readRole.body.id as string}/permissions`)
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ permissionKeys: ['projects.project.read', 'projects.team.read'] })
    .expect(201);
  const readUser = await registerNativeUser(context, {
    email: 'team-read@test.dev',
    displayName: 'Team Read',
    password: 'TeamRead123!',
  });
  await context.http
    .post('/api/v1/role-assignments')
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({
      organizationId,
      principalId: readUser.body.user.id as string,
      roleId: readRole.body.id as string,
      scopeType: 'ORGANIZATION',
      scopeId: organizationId,
    })
    .expect(201);
  const readLogin = await loginNativeUser(context, {
    email: 'team-read@test.dev',
    password: 'TeamRead123!',
    activeOrganizationId: organizationId,
  });
  await context.http
    .post(`/api/v1/projects/${projectId}/team`)
    .set('Authorization', `Bearer ${readLogin.body.accessToken as string}`)
    .set('Idempotency-Key', 'team-no-manage')
    .send({
      displayName: 'No Manage',
      role: 'OBSERVER',
      capacity: 1,
      status: 'PLANNED',
    })
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
    .get(`/api/v1/projects/${projectId}/team`)
    .set('Authorization', `Bearer ${readOnlyLogin.body.accessToken as string}`)
    .expect(200);
  await context.http
    .post(`/api/v1/projects/${projectId}/team`)
    .set('Authorization', `Bearer ${readOnlyLogin.body.accessToken as string}`)
    .set('Idempotency-Key', 'team-readonly-create')
    .send({
      displayName: 'Readonly',
      role: 'OBSERVER',
      capacity: 1,
      status: 'PLANNED',
    })
    .expect(403);
}
