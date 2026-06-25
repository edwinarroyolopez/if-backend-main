import {
  ProjectContextSnapshotReadModel,
  RoadmapImportIssue,
} from './projects-legacy.types';

export function clampActivityLimit(limit: number | undefined) {
  if (!limit) return 25;
  return Math.max(1, Math.min(limit, 100));
}
export function readSafeScalar(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  if (!record) return undefined;
  const value = record[key];
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return undefined;
}
export function readString(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = readSafeScalar(record, key);
  return typeof value === 'string' ? value : undefined;
}
export function readNumber(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = readSafeScalar(record, key);
  return typeof value === 'number' ? value : undefined;
}
export function readArray(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  if (!record) return undefined;
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}
export function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}
export function coerceContextSnapshotReadModel(
  value: Record<string, unknown> | undefined,
): ProjectContextSnapshotReadModel | null {
  if (!value) {
    return null;
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.organizationId !== 'string' ||
    typeof value.projectId !== 'string' ||
    typeof value.snapshotKey !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.approvedDocumentationHash !== 'string' ||
    typeof value.contentSummary !== 'string' ||
    typeof value.createdBy !== 'string' ||
    !Array.isArray(value.sourcePageIds) ||
    !value.sourcePageVersions ||
    typeof value.sourcePageVersions !== 'object'
  ) {
    return null;
  }
  return value as ProjectContextSnapshotReadModel;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export function assertAllowedKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: string[],
  errors: RoadmapImportIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push({
        path: `${path}.${key}`,
        message: 'Additional property is not allowed.',
      });
    }
  }
}
export function collectUniqueKeys(
  items: Record<string, unknown>[],
  path: string,
  errors: RoadmapImportIssue[],
) {
  const keys = new Set<string>();
  for (const item of items) {
    const key = stringValue(item.key);
    if (!key) continue;
    if (keys.has(key)) {
      errors.push({ path, message: `Duplicate key ${key}.` });
    }
    keys.add(key);
  }
  return keys;
}
export function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
export function numberValue(value: unknown) {
  return typeof value === 'number' ? value : 0;
}
export function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
export function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
export function isValidRoadmapEstimate(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  if (Object.keys(value).some((key) => !['unit', 'value'].includes(key))) {
    return false;
  }
  if (value.unit === 'POINTS' || value.unit === 'IDEAL_DAYS') {
    return (
      typeof value.value === 'number' && value.value >= 0 && value.value <= 1000
    );
  }
  if (value.unit === 'T_SHIRT') {
    return (
      typeof value.value === 'string' &&
      ['XS', 'S', 'M', 'L', 'XL'].includes(value.value)
    );
  }
  return false;
}
