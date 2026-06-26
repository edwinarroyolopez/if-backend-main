import { createTestContext } from '../app-test-context';
import { buildRoadmapImport } from './project-roadmap-import-builder';

export async function expectRoadmapImportInvalid(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
  projectId: string,
  roadmapImport: Record<string, unknown>,
  expectedPath: string,
) {
  const response = await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/preview`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ roadmapImport })
    .expect(400);
  expect(JSON.stringify(response.body.metadata)).toContain(expectedPath);
}

export function buildLargeRoadmapImport(snapshot: Record<string, unknown>) {
  const roadmapImport = buildRoadmapImport(snapshot, {
    versionLabel: 'v2-large',
  });
  const sourceReferences = roadmapImport.horizons[0].sourceReferences;
  const horizons = Array.from({ length: 5 }, (_, index) => ({
    key: `h${index + 1}`,
    label: `Horizonte ${index + 1}`,
    startDate: '2026-07-01',
    endDate: '2027-07-25',
    objective: `Objetivo del horizonte ${index + 1}`,
    sourceReferences,
  }));
  const milestones = horizons.map((horizon, index) => ({
    key: `m${index + 1}`,
    horizonKey: horizon.key,
    title: `Milestone ${index + 1}`,
    objective: `Objetivo del milestone ${index + 1}`,
    targetDate: '2027-07-25',
    status: 'PLANNED',
    order: index,
    dependencies: index === 0 ? [] : [`m${index}`],
    sourceReferences,
  }));
  const epics = Array.from({ length: 21 }, (_, index) => ({
    key: `e${index + 1}`,
    milestoneKey: milestones[Math.min(Math.floor(index / 5), 4)].key,
    title: `Epic ${index + 1}`,
    objective: `Objetivo del epic ${index + 1}`,
    expectedOutcome: `Resultado del epic ${index + 1}`,
    priority: index + 1,
    status: 'PLANNED',
    order: index,
    estimate: { unit: 'T_SHIRT', value: index % 2 === 0 ? 'L' : 'XL' },
    dependencies: index === 0 ? [] : [`e${index}`],
    sourceReferences,
  }));
  const backlogCandidates = Array.from({ length: 42 }, (_, index) => ({
    key: `b${index + 1}`,
    epicKey: epics[Math.floor(index / 2)].key,
    type: index % 5 === 0 ? 'SPIKE' : 'STORY',
    title: `Backlog candidate ${index + 1}`,
    description: `Descripcion del candidato ${index + 1}`,
    priority: index + 1,
    estimate: { unit: 'T_SHIRT', value: index % 2 === 0 ? 'M' : 'L' },
    acceptanceCriteria: [`Criterio ${index + 1}`],
    dependencies: index === 0 ? [] : [`b${index}`],
    sourceReferences,
  }));
  return {
    ...roadmapImport,
    roadmap: {
      ...roadmapImport.roadmap,
      title: 'Roadmap grande',
      versionLabel: 'v2-large',
      endDate: '2027-07-25',
    },
    horizons,
    milestones,
    epics,
    backlogCandidates,
  };
}
