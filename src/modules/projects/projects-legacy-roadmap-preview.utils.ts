import {
  ProjectBacklogImportPreviewReadModel,
  RoadmapImportIssue,
  RoadmapImportNormalized,
} from './projects-legacy.types';

export function sanitizeRoadmapImportPreview(preview: {
  valid: boolean;
  previewToken: string;
  importHash: string;
  summary: { milestones: number; epics: number; backlogCandidates: number };
  warnings: RoadmapImportIssue[];
  errors: RoadmapImportIssue[];
  normalized: RoadmapImportNormalized;
}) {
  return {
    valid: preview.valid,
    previewToken: preview.previewToken,
    contractVersion: 'inflight.project.roadmap.v1',
    promptTemplateVersion: 'project-roadmap-generation-v1',
    warnings: preview.warnings,
    errors: preview.errors,
    summary: preview.summary,
    roadmap: preview.normalized.roadmap,
    milestones: preview.normalized.milestones,
    epics: preview.normalized.epics,
    backlogCandidates: preview.normalized.backlogCandidates,
  };
}
export function emptyBacklogImportPreview(
  errors: RoadmapImportIssue[],
  roadmapId = '',
): ProjectBacklogImportPreviewReadModel {
  return {
    valid: false,
    previewToken: '',
    roadmapId,
    roadmapVersionId: '',
    roadmapVersionLabel: '',
    snapshotId: '',
    warnings: [],
    errors,
    summary: { candidates: 0, alreadyImported: 0, willCreate: 0 },
    candidates: [],
  };
}
