import { type TestContext } from '../app-test-context';
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
