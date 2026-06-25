import {
  isRecord,
  isValidRoadmapEstimate,
  recordArray,
  uniqueStrings,
} from './projects-legacy-value.utils';
import {
  AppException,
  PROJECT_BACKLOG_ITEM_STATUSES,
  PROJECT_BACKLOG_ITEM_TYPES,
  ProjectBacklogItemDocument,
  ProjectSprintItemDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectBacklogItemInput,
  ProjectBacklogItemReadModel,
  ProjectBacklogItemUpdate,
  ProjectSprintReadModel,
} from './projects-legacy.types';

export function normalizeBacklogItemInput(input: ProjectBacklogItemInput) {
  if (!PROJECT_BACKLOG_ITEM_TYPES.includes(input.type)) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Backlog item type is not supported',
      { field: 'type' },
    );
  }
  if (input.status && !PROJECT_BACKLOG_ITEM_STATUSES.includes(input.status)) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Backlog item status is not supported',
      { field: 'status' },
    );
  }
  if (input.status === 'SELECTED_FOR_SPRINT') {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'SELECTED_FOR_SPRINT is reserved for Scrum in Loop 8',
      { field: 'status' },
    );
  }
  if (!isValidRoadmapEstimate(input.estimate)) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Backlog item estimate is not valid',
      { field: 'estimate' },
    );
  }
  return {
    ...input,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    status: input.status ?? 'UNREFINED',
    acceptanceCriteria: uniqueStrings(input.acceptanceCriteria ?? []),
    sourceReferences: recordArray(input.sourceReferences),
    traceability: isRecord(input.traceability) ? input.traceability : {},
  };
}
export function assertExpectedBacklogItemVersion(
  item: ProjectBacklogItemDocument,
  expectedVersion: number,
) {
  if (item.version !== expectedVersion) {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'Backlog item version conflict',
      { expectedVersion, currentVersion: item.version },
    );
  }
}
export function assertExpectedSprintItemVersion(
  item: ProjectSprintItemDocument,
  expectedVersion: number,
) {
  if (item.version !== expectedVersion) {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'Sprint item version conflict',
      { expectedVersion, currentVersion: item.version },
    );
  }
}
export function applyBacklogItemUpdates(
  item: ProjectBacklogItemDocument,
  updates: ProjectBacklogItemUpdate,
) {
  let changed = false;
  if (updates.title !== undefined && updates.title.trim() !== item.title) {
    item.title = updates.title.trim();
    changed = true;
  }
  if (updates.description !== undefined) {
    const value = updates.description.trim();
    if (value !== item.description) {
      item.description = value;
      changed = true;
    }
  }
  if (updates.type !== undefined && updates.type !== item.type) {
    if (!PROJECT_BACKLOG_ITEM_TYPES.includes(updates.type)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Backlog item type is not supported',
        { field: 'type' },
      );
    }
    item.type = updates.type;
    changed = true;
  }
  if (updates.priority !== undefined && updates.priority !== item.priority) {
    item.priority = updates.priority;
    changed = true;
  }
  if (updates.estimate !== undefined) {
    if (!isValidRoadmapEstimate(updates.estimate)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Backlog item estimate is not valid',
        { field: 'estimate' },
      );
    }
    item.estimate = updates.estimate;
    changed = true;
  }
  if (updates.status !== undefined && updates.status !== item.status) {
    if (!PROJECT_BACKLOG_ITEM_STATUSES.includes(updates.status)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Backlog item status is not supported',
        { field: 'status' },
      );
    }
    item.status = updates.status;
    changed = true;
  }
  if (updates.acceptanceCriteria !== undefined) {
    item.acceptanceCriteria = uniqueStrings(updates.acceptanceCriteria);
    changed = true;
  }
  if (updates.sourceReferences !== undefined) {
    item.sourceReferences = recordArray(updates.sourceReferences);
    changed = true;
  }
  if (updates.traceability !== undefined) {
    item.traceability = isRecord(updates.traceability)
      ? updates.traceability
      : item.traceability;
    changed = true;
  }
  if (
    updates.assigneeId !== undefined &&
    updates.assigneeId !== item.assigneeId
  ) {
    item.assigneeId = updates.assigneeId?.trim() || undefined;
    changed = true;
  }
  return changed;
}
export function coerceBacklogItemReadModel(
  value: Record<string, unknown> | undefined,
): ProjectBacklogItemReadModel | null {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string'
  ) {
    return null;
  }
  return value as ProjectBacklogItemReadModel;
}
export function coerceBacklogListResponse(
  value: Record<string, unknown> | undefined,
) {
  if (!value || !Array.isArray(value.items)) {
    return null;
  }
  return value as { items: ProjectBacklogItemReadModel[] };
}
export function coerceBacklogImportCommitResponse(
  value: Record<string, unknown> | undefined,
) {
  if (!value || value.committed !== true || !Array.isArray(value.items)) {
    return null;
  }
  return value as {
    committed: true;
    created: ProjectBacklogItemReadModel[];
    skipped: ProjectBacklogItemReadModel[];
    items: ProjectBacklogItemReadModel[];
    summary: { created: number; skipped: number };
  };
}
export function coerceSprintReadModel(
  value: Record<string, unknown> | undefined,
): ProjectSprintReadModel | null {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.status !== 'string' ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  return value as ProjectSprintReadModel;
}
