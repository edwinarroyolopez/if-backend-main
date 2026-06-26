import {
  checklistKeys,
  decisionKeys,
  decisionStatuses,
  openQuestionKeys,
  riskImpacts,
  riskKeys,
  riskLikelihoods,
  statementKeys,
} from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertBoolean,
  assertClientReference,
  assertEnum,
  assertInteger,
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
  TraceableStatement,
} from './types';
export { validateContradictions } from './contradiction-validator';
export { validateSourceReferenceArray } from './source-reference-validator';
import { validateSourceReferenceArray } from './source-reference-validator';

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
  const items = value as unknown[];
  assertArrayLength(items, path, 0, maxItems, errors);
  items.forEach((item, index) => {
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
  return items;
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
