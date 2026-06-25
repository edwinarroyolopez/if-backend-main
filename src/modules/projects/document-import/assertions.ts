import type { DocumentImportValidationIssue } from './types';

export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  const allowed = new Set(allowedKeys);
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      errors.push({
        path: `${path}.${key}`,
        message: 'Additional property is not allowed.',
      });
    }
  });
}

export function requireFields(
  value: Record<string, unknown>,
  fields: string[],
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  fields.forEach((field) => {
    if (value[field] === undefined) {
      errors.push({
        path: `${path}.${field}`,
        message: 'Required property is missing.',
      });
    }
  });
}

export function assertConst(
  value: unknown,
  expected: string,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  if (value !== expected) {
    errors.push({ path, message: `Expected ${expected}.` });
  }
}

export function assertEnum(
  value: unknown,
  allowed: readonly string[],
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push({ path, message: `Expected one of: ${allowed.join(', ')}.` });
  }
}

export function assertStringLength(
  value: unknown,
  path: string,
  minLength: number,
  maxLength: number,
  errors: DocumentImportValidationIssue[],
) {
  if (typeof value !== 'string') {
    errors.push({ path, message: 'Expected a string.' });
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    errors.push({
      path,
      message: `String length must be between ${minLength} and ${maxLength}.`,
    });
  }
}

export function assertOptionalStringLength(
  value: unknown,
  path: string,
  minLength: number,
  maxLength: number,
  errors: DocumentImportValidationIssue[],
) {
  if (value === undefined) {
    return;
  }
  assertStringLength(value, path, minLength, maxLength, errors);
}

export function assertSlug(
  value: unknown,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  assertStringLength(value, path, 1, 120, errors);
  if (typeof value === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    errors.push({ path, message: 'Expected a normalized slug.' });
  }
}

export function assertClientReference(
  value: unknown,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  assertStringLength(value, path, 1, 80, errors);
  if (typeof value === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    errors.push({
      path,
      message: 'Expected a normalized client reference key.',
    });
  }
}

export function assertOptionalClientReference(
  value: unknown,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  if (value === undefined) {
    return;
  }
  assertClientReference(value, path, errors);
}

export function assertBoolean(
  value: unknown,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  if (typeof value !== 'boolean') {
    errors.push({ path, message: 'Expected a boolean.' });
  }
}

export function assertInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    errors.push({
      path,
      message: `Expected an integer between ${min} and ${max}.`,
    });
  }
}

export function assertOptionalInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: DocumentImportValidationIssue[],
) {
  if (value === undefined) {
    return;
  }
  assertInteger(value, path, min, max, errors);
}

export function assertOptionalNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: DocumentImportValidationIssue[],
) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || value < min || value > max) {
    errors.push({
      path,
      message: `Expected a number between ${min} and ${max}.`,
    });
  }
}

export function assertArrayLength(
  value: unknown[],
  path: string,
  minItems: number,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (value.length < minItems || value.length > maxItems) {
    errors.push({
      path,
      message: `Array length must be between ${minItems} and ${maxItems}.`,
    });
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
