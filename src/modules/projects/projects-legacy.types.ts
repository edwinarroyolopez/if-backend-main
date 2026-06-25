export * from './projects-legacy.inputs';
export * from './projects-legacy.read-models';
export type RoadmapImportNormalized = {
  schemaVersion: 'inflight.project.roadmap.v1';
  generationStatus: string;
  promptMetadata: Record<string, unknown>;
  snapshotReference: {
    snapshotId: string;
    snapshotKey: string;
    snapshotHash: string;
  };
  roadmap: {
    title: string;
    versionLabel: string;
    startDate: string;
    endDate: string;
    planningAssumptions: Record<string, unknown>[];
    constraints: Record<string, unknown>[];
  };
  horizons: Record<string, unknown>[];
  milestones: Array<{
    key: string;
    horizonKey: string;
    title: string;
    objective: string;
    targetDate: string;
    status: string;
    order: number;
    dependencies: string[];
    sourceReferences: Record<string, unknown>[];
  }>;
  epics: Array<{
    key: string;
    milestoneKey: string;
    title: string;
    objective: string;
    expectedOutcome: string;
    priority: number;
    status: string;
    order: number;
    estimate: Record<string, unknown>;
    dependencies: string[];
    sourceReferences: Record<string, unknown>[];
  }>;
  backlogCandidates: Array<
    Record<string, unknown> & { key: string; epicKey: string }
  >;
};
