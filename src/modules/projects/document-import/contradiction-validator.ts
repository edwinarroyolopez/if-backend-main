import { contradictionKeys } from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertClientReference,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import type { DocumentImportValidationIssue } from './types';
import { validateSourceReferenceArray } from './source-reference-validator';

export function validateContradictions(
  value: unknown,
  errors: DocumentImportValidationIssue[],
) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push({
      path: '$.contradictions',
      message: 'contradictions must be an array.',
    });
    return;
  }
  assertArrayLength(value, '$.contradictions', 0, 50, errors);
  value.forEach((item, index) => {
    const path = `$.contradictions[${index}]`;
    if (!isRecord(item)) {
      errors.push({ path, message: 'Contradiction must be an object.' });
      return;
    }
    assertAllowedKeys(item, contradictionKeys, path, errors);
    requireFields(
      item,
      ['key', 'description', 'conflictingSourceReferences'],
      path,
      errors,
    );
    assertClientReference(item.key, `${path}.key`, errors);
    assertStringLength(
      item.description,
      `${path}.description`,
      3,
      1500,
      errors,
    );
    validateSourceReferenceArray(
      item.conflictingSourceReferences,
      `${path}.conflictingSourceReferences`,
      2,
      20,
      errors,
    );
  });
}
