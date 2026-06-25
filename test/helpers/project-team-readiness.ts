import { type TestContext } from '../app-test-context';
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
