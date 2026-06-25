type BacklogCandidate = {
  key: string;
  epicKey?: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  estimate: Record<string, unknown>;
  acceptanceCriteria: string[];
  dependencies?: string[];
};

type RoadmapImportOptions = {
  title?: string;
  versionLabel?: string;
  assumptionStatement?: string;
  constraintStatement?: string;
  horizonLabel?: string;
  horizonObjective?: string;
  milestoneKey?: string;
  milestoneTitle?: string;
  milestoneObjective?: string;
  epicKey?: string;
  epicTitle?: string;
  epicObjective?: string;
  epicOutcome?: string;
  backlogKey?: string;
  backlogCandidates?: BacklogCandidate[];
};

export function buildRoadmapImport(
  snapshot: Record<string, unknown>,
  overrides: RoadmapImportOptions = {},
) {
  const snapshotId = snapshot.id as string;
  const snapshotKey = snapshot.snapshotKey as string;
  const snapshotHash = snapshot.approvedDocumentationHash as string;
  const milestoneKey = overrides.milestoneKey ?? 'm1';
  const epicKey = overrides.epicKey ?? 'e1';
  const sourceReferences = [
    {
      referenceType: 'SNAPSHOT',
      referenceId: snapshotId,
      referenceKey: snapshotKey,
    },
  ];
  const candidates = overrides.backlogCandidates ?? [
    {
      key: overrides.backlogKey ?? 'b1',
      type: 'STORY',
      title: 'Crear flujo base',
      description: 'Como usuario planifico desde roadmap aprobado.',
      priority: 1,
      estimate: { unit: 'POINTS', value: 5 },
      acceptanceCriteria: ['Roadmap visible'],
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
      title: overrides.title ?? 'Roadmap Fase 1',
      versionLabel: overrides.versionLabel ?? 'v1',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      planningAssumptions: [
        {
          key: 'assumption-1',
          statement: overrides.assumptionStatement ?? 'Plan trazable',
          sourceReferences,
        },
      ],
      constraints: [
        {
          key: 'constraint-1',
          statement: overrides.constraintStatement ?? 'Usar snapshot aprobado',
          sourceReferences,
        },
      ],
    },
    horizons: [
      {
        key: 'h1',
        label: overrides.horizonLabel ?? 'Fase 1',
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        objective: overrides.horizonObjective ?? 'Entregar base',
        sourceReferences,
      },
    ],
    milestones: [
      {
        key: milestoneKey,
        horizonKey: 'h1',
        title: overrides.milestoneTitle ?? 'Base operativa',
        objective: overrides.milestoneObjective ?? 'Activar flujo base',
        targetDate: '2026-08-01',
        status: 'PLANNED',
        order: 0,
        dependencies: [],
        sourceReferences,
      },
    ],
    epics: [
      {
        key: epicKey,
        milestoneKey,
        title: overrides.epicTitle ?? 'Experiencia base',
        objective: overrides.epicObjective ?? 'Preparar producto',
        expectedOutcome: overrides.epicOutcome ?? 'Usuarios pueden planificar',
        priority: 1,
        status: 'PLANNED',
        order: 0,
        estimate: { unit: 'POINTS', value: 8 },
        dependencies: [],
        sourceReferences,
      },
    ],
    backlogCandidates: candidates.map((candidate) => ({
      ...candidate,
      epicKey: candidate.epicKey ?? epicKey,
      sourceReferences,
    })),
  };
}
