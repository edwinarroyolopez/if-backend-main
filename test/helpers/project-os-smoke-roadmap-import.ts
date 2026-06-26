export function buildSmokeRoadmapImport(snapshot: Record<string, unknown>) {
  const snapshotId = snapshot.id as string;
  const snapshotKey = snapshot.snapshotKey as string;
  const snapshotHash = snapshot.approvedDocumentationHash as string;
  const sourceReferences = [
    {
      referenceType: 'SNAPSHOT',
      referenceId: snapshotId,
      referenceKey: snapshotKey,
    },
  ];
  return {
    schemaVersion: 'inflight.project.roadmap.v1',
    generationStatus: 'READY',
    promptMetadata: {
      promptPurpose: 'PROJECT_ROADMAP_GENERATION',
      promptTemplateVersion: 'project-roadmap-generation-v1',
      contractVersion: 'inflight.project.roadmap.v1',
    },
    snapshotReference: { snapshotId, snapshotKey, snapshotHash },
    roadmap: {
      title: 'Roadmap Smoke',
      versionLabel: 'v1',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      planningAssumptions: [
        { key: 'assumption-1', statement: 'Smoke E2E listo', sourceReferences },
      ],
      constraints: [
        {
          key: 'constraint-1',
          statement: 'Sin proveedor IA',
          sourceReferences,
        },
      ],
    },
    horizons: [
      {
        key: 'h1',
        label: 'Smoke Horizon',
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        objective: 'Validar Project OS completo',
        sourceReferences,
      },
    ],
    milestones: [
      {
        key: 'm1',
        horizonKey: 'h1',
        title: 'Smoke Milestone',
        objective: 'Preparar producto',
        targetDate: '2026-08-01',
        status: 'PLANNED',
        order: 0,
        dependencies: [],
        sourceReferences,
      },
    ],
    epics: [
      {
        key: 'e1',
        milestoneKey: 'm1',
        title: 'Smoke Epic',
        objective: 'Conectar superficie primaria',
        expectedOutcome: 'Smoke con persistencia',
        priority: 1,
        status: 'PLANNED',
        order: 0,
        estimate: { unit: 'POINTS', value: 8 },
        dependencies: [],
        sourceReferences,
      },
    ],
    backlogCandidates: [
      {
        key: 'smoke-candidate-1',
        epicKey: 'e1',
        title: 'Smoke backlog principal',
        type: 'STORY',
        description: 'Permite probar sprint real.',
        priority: 1,
        estimate: { unit: 'T_SHIRT', value: 'M' },
        acceptanceCriteria: ['Sprint real visible'],
        sourceReferences,
      },
      {
        key: 'smoke-candidate-2',
        epicKey: 'e1',
        title: 'Smoke backlog secundario',
        type: 'TASK',
        description: 'Permite probar dedupe de backlog.',
        priority: 2,
        estimate: { unit: 'T_SHIRT', value: 'S' },
        acceptanceCriteria: ['Backlog idempotente'],
        sourceReferences,
      },
    ],
  };
}
