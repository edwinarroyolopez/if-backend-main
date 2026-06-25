import { type TestContext } from '../app-test-context';
import { buildRoadmapImport } from './project-roadmap-import-builder';

export async function createActiveBacklogRoadmap(
  context: TestContext,
  accessToken: string,
  projectId: string,
) {
  const page = await context.http
    .post(`/api/v1/projects/${projectId}/document-pages`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'backlog-doc-create')
    .send({
      title: 'Base backlog aprobada',
      summary: 'Contexto aprobado para backlog.',
      bodyMarkdown: 'Construir backlog desde roadmap aprobado.',
      facts: ['Fact backlog'],
    })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/document-pages/${page.body.id as string}/submit-review`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ expectedVersion: 1 })
    .expect(201);
  await context.http
    .post(
      `/api/v1/projects/${projectId}/document-pages/${page.body.id as string}/approve`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'backlog-doc-approve')
    .send({ expectedVersion: 2 })
    .expect(201);
  const snapshot = await context.http
    .post(`/api/v1/projects/${projectId}/context-snapshots`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'backlog-snapshot-create')
    .expect(201);
  const roadmapImport = buildRoadmapImport(snapshot.body, {
    title: 'Roadmap Backlog',
    backlogCandidates: [
      {
        key: 'b1',
        type: 'STORY',
        title: 'Crear flujo base',
        description: 'Como usuario planifico desde roadmap aprobado.',
        priority: 1,
        estimate: { unit: 'POINTS', value: 5 },
        acceptanceCriteria: ['Roadmap visible'],
      },
      {
        key: 'b2',
        type: 'ENABLER',
        title: 'Preparar trazabilidad',
        description: 'Mantener links a snapshot y documentos.',
        priority: 2,
        estimate: { unit: 'T_SHIRT', value: 'M' },
        acceptanceCriteria: ['Trazabilidad visible'],
      },
    ],
  });
  const preview = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ roadmapImport })
    .expect(201);
  const committed = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/commit`)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Idempotency-Key', 'backlog-roadmap-commit')
    .send({ roadmapImport, previewToken: preview.body.previewToken as string })
    .expect(201);
  const activated = await context.http
    .post(
      `/api/v1/projects/${projectId}/roadmaps/${committed.body.id as string}/activate`,
    )
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
  return activated.body;
}

export function copyBacklogSourceFields(item: Record<string, unknown>) {
  return {
    roadmapId: item.roadmapId,
    roadmapVersionId: item.roadmapVersionId,
    milestoneId: item.milestoneId,
    milestoneKey: item.milestoneKey,
    milestoneTitle: item.milestoneTitle,
    epicId: item.epicId,
    epicKey: item.epicKey,
    epicTitle: item.epicTitle,
    sourceReferences: item.sourceReferences,
    traceability: item.traceability,
  };
}
