import {
  checklistKeys,
  contradictionKeys,
  decisionKeys,
  decisionStatuses,
  openQuestionKeys,
  riskImpacts,
  riskKeys,
  riskLikelihoods,
  sourceReferenceKeys,
  sourceReferenceTypes,
  statementKeys,
} from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertBoolean,
  assertClientReference,
  assertEnum,
  assertInteger,
  assertOptionalNumber,
  assertOptionalStringLength,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import type {
  Decision,
  DocumentImportValidationIssue,
  OpenQuestion,
  Risk,
  SourceReference,
  TraceableStatement,
} from './types';

export function validateChecklistArray(
  value: unknown,
  path: string,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'checklist must be an array.' });
    return [];
  }
  assertArrayLength(value, path, 0, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({
        path: itemPath,
        message: 'Checklist item must be an object.',
      });
      return;
    }
    assertAllowedKeys(item, checklistKeys, itemPath, errors);
    requireFields(
      item,
      ['key', 'text', 'required', 'completed', 'order', 'sourceReferences'],
      itemPath,
      errors,
    );
    assertClientReference(item.key, `${itemPath}.key`, errors);
    assertStringLength(item.text, `${itemPath}.text`, 3, 300, errors);
    assertBoolean(item.required, `${itemPath}.required`, errors);
    assertBoolean(item.completed, `${itemPath}.completed`, errors);
    assertInteger(item.order, `${itemPath}.order`, 0, 10000, errors);
    validateSourceReferenceArray(
      item.sourceReferences,
      `${itemPath}.sourceReferences`,
      0,
      20,
      errors,
    );
  });
  return value;
}

export function validateStatementArray(
  value: unknown,
  path: string,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'Value must be an array.' });
    return [];
  }
  assertArrayLength(value, path, 0, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({ path: itemPath, message: 'Statement must be an object.' });
      return;
    }
    assertAllowedKeys(item, statementKeys, itemPath, errors);
    requireFields(
      item,
      ['key', 'statement', 'sourceReferences'],
      itemPath,
      errors,
    );
    assertClientReference(item.key, `${itemPath}.key`, errors);
    assertStringLength(
      item.statement,
      `${itemPath}.statement`,
      3,
      1000,
      errors,
    );
    validateSourceReferenceArray(
      item.sourceReferences,
      `${itemPath}.sourceReferences`,
      1,
      20,
      errors,
    );
  });
  return value as TraceableStatement[];
}

export function validateDecisionArray(
  value: unknown,
  path: string,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'decisions must be an array.' });
    return [];
  }
  assertArrayLength(value, path, 0, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({ path: itemPath, message: 'Decision must be an object.' });
      return;
    }
    assertAllowedKeys(item, decisionKeys, itemPath, errors);
    requireFields(
      item,
      ['key', 'decision', 'rationale', 'status', 'sourceReferences'],
      itemPath,
      errors,
    );
    assertClientReference(item.key, `${itemPath}.key`, errors);
    assertStringLength(item.decision, `${itemPath}.decision`, 3, 1000, errors);
    assertStringLength(
      item.rationale,
      `${itemPath}.rationale`,
      3,
      1500,
      errors,
    );
    assertEnum(item.status, decisionStatuses, `${itemPath}.status`, errors);
    validateSourceReferenceArray(
      item.sourceReferences,
      `${itemPath}.sourceReferences`,
      1,
      20,
      errors,
    );
  });
  return value as Decision[];
}

export function validateRiskArray(
  value: unknown,
  path: string,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'risks must be an array.' });
    return [];
  }
  assertArrayLength(value, path, 0, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({ path: itemPath, message: 'Risk must be an object.' });
      return;
    }
    assertAllowedKeys(item, riskKeys, itemPath, errors);
    requireFields(
      item,
      ['key', 'risk', 'impact', 'likelihood', 'mitigation', 'sourceReferences'],
      itemPath,
      errors,
    );
    assertClientReference(item.key, `${itemPath}.key`, errors);
    assertStringLength(item.risk, `${itemPath}.risk`, 3, 1000, errors);
    assertEnum(item.impact, riskImpacts, `${itemPath}.impact`, errors);
    assertEnum(
      item.likelihood,
      riskLikelihoods,
      `${itemPath}.likelihood`,
      errors,
    );
    assertStringLength(
      item.mitigation,
      `${itemPath}.mitigation`,
      3,
      1500,
      errors,
    );
    validateSourceReferenceArray(
      item.sourceReferences,
      `${itemPath}.sourceReferences`,
      1,
      20,
      errors,
    );
  });
  return value as Risk[];
}

export function validateOpenQuestionArray(
  value: unknown,
  path: string,
  maxItems: number,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'openQuestions must be an array.' });
    return [];
  }
  assertArrayLength(value, path, 0, maxItems, errors);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push({
        path: itemPath,
        message: 'Open question must be an object.',
      });
      return;
    }
    assertAllowedKeys(item, openQuestionKeys, itemPath, errors);
    requireFields(
      item,
      ['key', 'question', 'sourceReferences'],
      itemPath,
      errors,
    );
    assertClientReference(item.key, `${itemPath}.key`, errors);
    assertStringLength(item.question, `${itemPath}.question`, 3, 1000, errors);
    assertOptionalStringLength(
      item.ownerHint,
      `${itemPath}.ownerHint`,
      1,
      160,
      errors,
    );
    validateSourceReferenceArray(
      item.sourceReferences,
      `${itemPath}.sourceReferences`,
      1,
      20,
      errors,
    );
  });
  return value as OpenQuestion[];
}

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
