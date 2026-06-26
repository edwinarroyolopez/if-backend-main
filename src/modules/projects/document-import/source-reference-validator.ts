import { sourceReferenceKeys, sourceReferenceTypes } from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertEnum,
  assertOptionalNumber,
  assertOptionalStringLength,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import type { DocumentImportValidationIssue, SourceReference } from './types';

export function validateSourceReferenceArray(
  value: unknown,
  path: string,
  minItems: number,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'sourceReferences must be an array.' });
    return [];
  }
  assertArrayLength(value, path, minItems, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({
        path: itemPath,
        message: 'Source reference must be an object.',
      });
      return;
    }
    assertAllowedKeys(item, sourceReferenceKeys, itemPath, errors);
    requireFields(item, ['referenceType', 'referenceKey'], itemPath, errors);
    assertEnum(
      item.referenceType,
      sourceReferenceTypes,
      `${itemPath}.referenceType`,
      errors,
    );
    assertStringLength(
      item.referenceKey,
      `${itemPath}.referenceKey`,
      1,
      160,
      errors,
    );
    assertOptionalStringLength(item.path, `${itemPath}.path`, 1, 300, errors);
    assertOptionalStringLength(
      item.quote,
      `${itemPath}.quote`,
      1,
      1000,
      errors,
    );
    assertOptionalNumber(
      item.confidence,
      `${itemPath}.confidence`,
      0,
      1,
      errors,
    );
  });
  return value as SourceReference[];
}
