import {
  DOCUMENTATION_PROMPT_PURPOSE,
  DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
  DOCUMENTATION_SCHEMA_VERSION,
  generationStatuses,
  projectIdentityKeys,
  promptMetadataKeys,
  rootKeys,
} from './constants';
import {
  assertAllowedKeys,
  assertConst,
  assertEnum,
  assertOptionalStringLength,
  assertSlug,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import {
  validateContradictions,
  validateDecisionArray,
  validateOpenQuestionArray,
  validateRiskArray,
  validateStatementArray,
} from './collection-validators';
import { validatePages } from './page-validation';
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
