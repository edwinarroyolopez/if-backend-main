import {
  DOCUMENTATION_PROMPT_PURPOSE,
  DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
  DOCUMENTATION_SCHEMA_VERSION,
  generationStatuses,
  pageKeys,
  pageTypes,
  projectIdentityKeys,
  promptMetadataKeys,
  rootKeys,
} from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertClientReference,
  assertConst,
  assertEnum,
  assertOptionalClientReference,
  assertOptionalInteger,
  assertOptionalStringLength,
  assertSlug,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import {
  validateChecklistArray,
  validateContradictions,
  validateDecisionArray,
  validateOpenQuestionArray,
  validateRiskArray,
  validateSourceReferenceArray,
  validateStatementArray,
} from './collection-validators';
import { validateReferences } from './reference-validation';
import type {
  DocumentationImportPayload,
  DocumentImportValidationIssue,
} from './types';

export function validateDocumentImportShape(
  value: unknown,
  errors: DocumentImportValidationIssue[],
): DocumentationImportPayload | null {
  if (!isRecord(value)) {
    errors.push({
      path: '$',
      message: 'Document import must be a JSON object.',
    });
    return null;
  }

  assertAllowedKeys(value, rootKeys, '$', errors);
  requireFields(
    value,
    [
      'schemaVersion',
      'generationStatus',
      'promptMetadata',
      'projectIdentity',
      'pages',
      'facts',
      'assumptions',
      'decisions',
      'risks',
      'openQuestions',
    ],
    '$',
    errors,
  );
  assertConst(
    value.schemaVersion,
    DOCUMENTATION_SCHEMA_VERSION,
    '$.schemaVersion',
    errors,
  );
  assertEnum(
    value.generationStatus,
    generationStatuses,
    '$.generationStatus',
    errors,
  );
  if (value.generationStatus !== 'READY') {
    errors.push({
      path: '$.generationStatus',
      message:
        'Only READY documentation imports can be previewed or committed.',
    });
  }

  validatePromptMetadata(value.promptMetadata, errors);
  validateProjectIdentity(value.projectIdentity, errors);
  const facts = validateStatementArray(value.facts, '$.facts', 200, errors);
  const assumptions = validateStatementArray(
    value.assumptions,
    '$.assumptions',
    200,
    errors,
  );
  const decisions = validateDecisionArray(
    value.decisions,
    '$.decisions',
    200,
    errors,
  );
  const risks = validateRiskArray(value.risks, '$.risks', 200, errors);
  const openQuestions = validateOpenQuestionArray(
    value.openQuestions,
    '$.openQuestions',
    100,
    errors,
  );
  validateContradictions(value.contradictions, errors);
  validatePages(value.pages, errors);

  if (errors.length > 0) {
    return null;
  }

  const payload = value as DocumentationImportPayload;
  validateReferences(
    payload,
    facts,
    assumptions,
    decisions,
    risks,
    openQuestions,
    errors,
  );
  return errors.length === 0 ? payload : null;
}

function validatePromptMetadata(
  value: unknown,
  errors: DocumentImportValidationIssue[],
) {
  if (!isRecord(value)) {
    errors.push({
      path: '$.promptMetadata',
      message: 'promptMetadata must be an object.',
    });
    return;
  }
  assertAllowedKeys(value, promptMetadataKeys, '$.promptMetadata', errors);
  requireFields(
    value,
    ['promptPurpose', 'promptTemplateVersion', 'contractVersion'],
    '$.promptMetadata',
    errors,
  );
  assertConst(
    value.promptPurpose,
    DOCUMENTATION_PROMPT_PURPOSE,
    '$.promptMetadata.promptPurpose',
    errors,
  );
  assertConst(
    value.promptTemplateVersion,
    DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
    '$.promptMetadata.promptTemplateVersion',
    errors,
  );
  assertConst(
    value.contractVersion,
    DOCUMENTATION_SCHEMA_VERSION,
    '$.promptMetadata.contractVersion',
    errors,
  );
  assertOptionalStringLength(
    value.promptChecksum,
    '$.promptMetadata.promptChecksum',
    8,
    128,
    errors,
  );
  assertOptionalStringLength(
    value.generatedAt,
    '$.promptMetadata.generatedAt',
    1,
    80,
    errors,
  );
}

function validateProjectIdentity(
  value: unknown,
  errors: DocumentImportValidationIssue[],
) {
  if (!isRecord(value)) {
    errors.push({
      path: '$.projectIdentity',
      message: 'projectIdentity must be an object.',
    });
    return;
  }
  assertAllowedKeys(value, projectIdentityKeys, '$.projectIdentity', errors);
  requireFields(
    value,
    ['projectName', 'projectKey'],
    '$.projectIdentity',
    errors,
  );
  assertStringLength(
    value.projectName,
    '$.projectIdentity.projectName',
    3,
    160,
    errors,
  );
  assertSlug(value.projectKey, '$.projectIdentity.projectKey', errors);
  assertOptionalStringLength(
    value.organizationHint,
    '$.projectIdentity.organizationHint',
    1,
    160,
    errors,
  );
  assertOptionalStringLength(
    value.clientHint,
    '$.projectIdentity.clientHint',
    1,
    160,
    errors,
  );
}

function validatePages(
  value: unknown,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path: '$.pages', message: 'pages must be an array.' });
    return [];
  }
  assertArrayLength(value, '$.pages', 1, 60, errors);
  value.forEach((page, index) =>
    validatePage(page, `$.pages[${index}]`, errors),
  );
  return value;
}

function validatePage(
  value: unknown,
  path: string,
  errors: DocumentImportValidationIssue[],
) {
  if (!isRecord(value)) {
    errors.push({ path, message: 'Page must be an object.' });
    return;
  }
  assertAllowedKeys(value, pageKeys, path, errors);
  requireFields(
    value,
    [
      'clientReference',
      'title',
      'slug',
      'pageType',
      'summary',
      'bodyMarkdown',
      'status',
      'checklist',
      'facts',
      'assumptions',
      'decisions',
      'risks',
      'openQuestions',
      'sourceReferences',
    ],
    path,
    errors,
  );
  assertClientReference(
    value.clientReference,
    `${path}.clientReference`,
    errors,
  );
  assertOptionalClientReference(
    value.parentClientReference,
    `${path}.parentClientReference`,
    errors,
  );
  assertStringLength(value.title, `${path}.title`, 3, 160, errors);
  assertSlug(value.slug, `${path}.slug`, errors);
  assertEnum(value.pageType, pageTypes, `${path}.pageType`, errors);
  assertStringLength(value.summary, `${path}.summary`, 10, 2000, errors);
  assertStringLength(
    value.bodyMarkdown,
    `${path}.bodyMarkdown`,
    20,
    50000,
    errors,
  );
  assertConst(value.status, 'DRAFT', `${path}.status`, errors);
  assertOptionalInteger(value.sortOrder, `${path}.sortOrder`, 0, 10000, errors);
  validateChecklistArray(value.checklist, `${path}.checklist`, 100, errors);
  validateStatementArray(value.facts, `${path}.facts`, 100, errors);
  validateStatementArray(value.assumptions, `${path}.assumptions`, 100, errors);
  validateDecisionArray(value.decisions, `${path}.decisions`, 100, errors);
  validateRiskArray(value.risks, `${path}.risks`, 100, errors);
  validateOpenQuestionArray(
    value.openQuestions,
    `${path}.openQuestions`,
    50,
    errors,
  );
  validateSourceReferenceArray(
    value.sourceReferences,
    `${path}.sourceReferences`,
    1,
    100,
    errors,
  );
}
