import {
  assertAllowedKeys,
  collectUniqueKeys,
  isRecord,
  isValidRoadmapEstimate,
  numberValue,
  recordArray,
  stringArray,
  stringValue,
} from './projects-legacy-value.utils';
import {
  RoadmapImportIssue,
  RoadmapImportNormalized,
} from './projects-legacy.types';

export function validateRoadmapImportShape(value: unknown): {
  normalized?: RoadmapImportNormalized;
  errors: RoadmapImportIssue[];
} {
  const errors: RoadmapImportIssue[] = [];
  if (!isRecord(value)) {
    return {
      errors: [{ path: '$', message: 'Roadmap import must be an object.' }],
    };
  }
  assertAllowedKeys(
    value,
    '$',
    [
      'schemaVersion',
      'generationStatus',
      'promptMetadata',
      'snapshotReference',
      'roadmap',
      'horizons',
      'milestones',
      'epics',
      'backlogCandidates',
    ],
    errors,
  );
  if (value.schemaVersion !== 'inflight.project.roadmap.v1') {
    errors.push({
      path: '$.schemaVersion',
      message: 'Expected inflight.project.roadmap.v1.',
    });
  }
  if (value.generationStatus !== 'READY') {
    errors.push({
      path: '$.generationStatus',
      message: 'Only READY roadmap imports can be committed.',
    });
  }
  if (!isRecord(value.promptMetadata)) {
    errors.push({
      path: '$.promptMetadata',
      message: 'promptMetadata is required.',
    });
  } else {
    assertAllowedKeys(
      value.promptMetadata,
      '$.promptMetadata',
      [
        'promptPurpose',
        'promptTemplateVersion',
        'contractVersion',
        'promptChecksum',
        'generatedAt',
      ],
      errors,
    );
    if (value.promptMetadata.promptPurpose !== 'PROJECT_ROADMAP_GENERATION') {
      errors.push({
        path: '$.promptMetadata.promptPurpose',
        message: 'Invalid prompt purpose.',
      });
    }
    if (
      value.promptMetadata.promptTemplateVersion !==
      'project-roadmap-generation-v1'
    ) {
      errors.push({
        path: '$.promptMetadata.promptTemplateVersion',
        message: 'Invalid prompt template version.',
      });
    }
    if (
      value.promptMetadata.contractVersion !== 'inflight.project.roadmap.v1'
    ) {
      errors.push({
        path: '$.promptMetadata.contractVersion',
        message: 'Invalid contract version.',
      });
    }
  }
  const snapshotReference = value.snapshotReference;
  if (!isRecord(snapshotReference)) {
    errors.push({
      path: '$.snapshotReference',
      message: 'snapshotReference is required.',
    });
  }
  const roadmap = value.roadmap;
  if (!isRecord(roadmap)) {
    errors.push({ path: '$.roadmap', message: 'roadmap is required.' });
  }
  const horizons = Array.isArray(value.horizons)
    ? value.horizons.filter(isRecord)
    : [];
  const milestones = Array.isArray(value.milestones)
    ? value.milestones.filter(isRecord)
    : [];
  const epics = Array.isArray(value.epics) ? value.epics.filter(isRecord) : [];
  const backlogCandidates = Array.isArray(value.backlogCandidates)
    ? value.backlogCandidates.filter(isRecord)
    : [];
  if (horizons.length === 0)
    errors.push({
      path: '$.horizons',
      message: 'At least one horizon is required.',
    });
  if (milestones.length === 0)
    errors.push({
      path: '$.milestones',
      message: 'At least one milestone is required.',
    });
  if (epics.length === 0)
    errors.push({ path: '$.epics', message: 'At least one epic is required.' });
  if (backlogCandidates.length === 0)
    errors.push({
      path: '$.backlogCandidates',
      message: 'At least one backlog candidate is required.',
    });
  if (!isRecord(snapshotReference) || !isRecord(roadmap)) {
    return { errors };
  }
  assertAllowedKeys(
    snapshotReference,
    '$.snapshotReference',
    ['snapshotId', 'snapshotKey', 'snapshotHash'],
    errors,
  );
  assertAllowedKeys(
    roadmap,
    '$.roadmap',
    [
      'title',
      'versionLabel',
      'startDate',
      'endDate',
      'planningAssumptions',
      'constraints',
    ],
    errors,
  );
  const startDate = stringValue(roadmap.startDate);
  const endDate = stringValue(roadmap.endDate);
  if (!startDate || !endDate || endDate < startDate) {
    errors.push({
      path: '$.roadmap.endDate',
      message: 'Roadmap endDate must be on or after startDate.',
    });
  }
  const horizonKeys = new Set(
    horizons.map((item) => stringValue(item.key)).filter(Boolean),
  );
  const milestoneKeys = collectUniqueKeys(milestones, '$.milestones', errors);
  const epicKeys = collectUniqueKeys(epics, '$.epics', errors);
  for (const milestone of milestones) {
    const key = stringValue(milestone.key);
    if (!horizonKeys.has(stringValue(milestone.horizonKey))) {
      errors.push({
        path: `$.milestones[${key || '?'}].horizonKey`,
        message: 'Milestone horizonKey must reference an existing horizon.',
      });
    }
    for (const dependency of stringArray(milestone.dependencies)) {
      if (!milestoneKeys.has(dependency)) {
        errors.push({
          path: `$.milestones[${key || '?'}].dependencies`,
          message: 'Milestone dependency does not exist.',
        });
      }
    }
  }
  for (const epic of epics) {
    const key = stringValue(epic.key);
    if (!milestoneKeys.has(stringValue(epic.milestoneKey))) {
      errors.push({
        path: `$.epics[${key || '?'}].milestoneKey`,
        message: 'Epic milestoneKey must reference an existing milestone.',
      });
    }
    for (const dependency of stringArray(epic.dependencies)) {
      if (!epicKeys.has(dependency)) {
        errors.push({
          path: `$.epics[${key || '?'}].dependencies`,
          message: 'Epic dependency does not exist.',
        });
      }
    }
    if (!isValidRoadmapEstimate(epic.estimate)) {
      errors.push({
        path: `$.epics[${key || '?'}].estimate`,
        message:
          'Estimate must use POINTS, IDEAL_DAYS or valid T_SHIRT values.',
      });
    }
  }
  for (const candidate of backlogCandidates) {
    const key = stringValue(candidate.key);
    if (!epicKeys.has(stringValue(candidate.epicKey))) {
      errors.push({
        path: `$.backlogCandidates[${key || '?'}].epicKey`,
        message: 'Backlog candidate epicKey must reference an existing epic.',
      });
    }
    if (!isValidRoadmapEstimate(candidate.estimate)) {
      errors.push({
        path: `$.backlogCandidates[${key || '?'}].estimate`,
        message:
          'Estimate must use POINTS, IDEAL_DAYS or valid T_SHIRT values.',
      });
    }
  }
  if (errors.length > 0) return { errors };
  return {
    errors,
    normalized: {
      schemaVersion: 'inflight.project.roadmap.v1',
      generationStatus: 'READY',
      promptMetadata: value.promptMetadata as Record<string, unknown>,
      snapshotReference: {
        snapshotId: stringValue(snapshotReference.snapshotId),
        snapshotKey: stringValue(snapshotReference.snapshotKey),
        snapshotHash: stringValue(snapshotReference.snapshotHash),
      },
      roadmap: {
        title: stringValue(roadmap.title),
        versionLabel: stringValue(roadmap.versionLabel),
        startDate,
        endDate,
        planningAssumptions: recordArray(roadmap.planningAssumptions),
        constraints: recordArray(roadmap.constraints),
      },
      horizons,
      milestones: milestones.map((item) => ({
        key: stringValue(item.key),
        horizonKey: stringValue(item.horizonKey),
        title: stringValue(item.title),
        objective: stringValue(item.objective),
        targetDate: stringValue(item.targetDate),
        status: stringValue(item.status),
        order: numberValue(item.order),
        dependencies: stringArray(item.dependencies),
        sourceReferences: recordArray(item.sourceReferences),
      })),
      epics: epics.map((item) => ({
        key: stringValue(item.key),
        milestoneKey: stringValue(item.milestoneKey),
        title: stringValue(item.title),
        objective: stringValue(item.objective),
        expectedOutcome: stringValue(item.expectedOutcome),
        priority: numberValue(item.priority),
        status: stringValue(item.status),
        order: numberValue(item.order),
        estimate: isRecord(item.estimate) ? item.estimate : {},
        dependencies: stringArray(item.dependencies),
        sourceReferences: recordArray(item.sourceReferences),
      })),
      backlogCandidates: backlogCandidates.map((item) => ({
        ...item,
        key: stringValue(item.key),
        epicKey: stringValue(item.epicKey),
      })),
    },
  };
}
