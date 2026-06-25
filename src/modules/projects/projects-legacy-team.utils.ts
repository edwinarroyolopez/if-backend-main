import { normalizeOptionalText } from './projects-legacy-core.utils';
import {
  AppException,
  PROJECT_MEMBERSHIP_ROLES,
  ProjectMembershipDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectMembershipInput,
  ProjectMembershipReadModel,
  ProjectMembershipUpdate,
} from './projects-legacy.types';

export function assertExpectedMembershipVersion(
  membership: ProjectMembershipDocument,
  expectedVersion: number,
) {
  if (membership.version !== expectedVersion) {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'Team membership version conflict',
      { expectedVersion, currentVersion: membership.version },
    );
  }
}
export function normalizeProjectMembershipInput(input: ProjectMembershipInput) {
  const displayName = input.displayName.trim();
  if (displayName.length < 2) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Team member display name is required',
      { field: 'displayName' },
    );
  }
  if (!PROJECT_MEMBERSHIP_ROLES.includes(input.role)) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Team member role is not supported',
      { field: 'role' },
    );
  }
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < 1 ||
    input.capacity > 80
  ) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Team member capacity must be hours per week between 1 and 80',
      { field: 'capacity', unit: 'HOURS_PER_WEEK' },
    );
  }
  const email = normalizeOptionalText(input.email);
  const emailNormalized = email?.toLowerCase();
  if (email && !isValidEmail(email)) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Team member email is not valid',
      { field: 'email' },
    );
  }
  return {
    userId: normalizeOptionalText(input.userId),
    displayName,
    email,
    emailNormalized,
    role: input.role,
    capacity: input.capacity,
    status: input.status ?? 'PLANNED',
  };
}
export function applyProjectMembershipUpdates(
  membership: ProjectMembershipDocument,
  updates: ProjectMembershipUpdate,
) {
  let changed = false;
  if (updates.userId !== undefined) {
    const value = normalizeOptionalText(updates.userId);
    if (value !== membership.userId) {
      membership.userId = value;
      changed = true;
    }
  }
  if (updates.displayName !== undefined) {
    const value = updates.displayName.trim();
    if (value.length < 2) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Team member display name is required',
        { field: 'displayName' },
      );
    }
    if (value !== membership.displayName) {
      membership.displayName = value;
      changed = true;
    }
  }
  if (updates.email !== undefined) {
    const email = normalizeOptionalText(updates.email);
    if (email && !isValidEmail(email)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Team member email is not valid',
        { field: 'email' },
      );
    }
    const emailNormalized = email?.toLowerCase();
    if (email !== membership.email) {
      membership.email = email;
      membership.emailNormalized = emailNormalized;
      changed = true;
    }
  }
  if (updates.role !== undefined && updates.role !== membership.role) {
    if (!PROJECT_MEMBERSHIP_ROLES.includes(updates.role)) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Team member role is not supported',
        { field: 'role' },
      );
    }
    membership.role = updates.role;
    changed = true;
  }
  if (
    updates.capacity !== undefined &&
    updates.capacity !== membership.capacity
  ) {
    if (
      !Number.isInteger(updates.capacity) ||
      updates.capacity < 1 ||
      updates.capacity > 80
    ) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Team member capacity must be hours per week between 1 and 80',
        { field: 'capacity', unit: 'HOURS_PER_WEEK' },
      );
    }
    membership.capacity = updates.capacity;
    changed = true;
  }
  return changed;
}
export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function coerceProjectMembershipReadModel(
  value: Record<string, unknown> | undefined,
): ProjectMembershipReadModel | null {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.capacity !== 'number' ||
    typeof value.status !== 'string'
  ) {
    return null;
  }
  return value as ProjectMembershipReadModel;
}
