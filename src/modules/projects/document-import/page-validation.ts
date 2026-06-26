import { pageKeys, pageTypes } from './constants';
import {
  assertAllowedKeys,
  assertArrayLength,
  assertClientReference,
  assertConst,
  assertEnum,
  assertOptionalClientReference,
  assertOptionalInteger,
  assertSlug,
  assertStringLength,
  isRecord,
  requireFields,
} from './assertions';
import {
  validateChecklistArray,
  validateDecisionArray,
  validateOpenQuestionArray,
  validateRiskArray,
  validateSourceReferenceArray,
  validateStatementArray,
} from './collection-validators';
import type { DocumentImportValidationIssue } from './types';

export function validatePages(
  value: unknown,
  errors: DocumentImportValidationIssue[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path: '$.pages', message: 'pages must be an array.' });
    return [];
  }
  const pages = value as unknown[];
  assertArrayLength(pages, '$.pages', 1, 60, errors);
  pages.forEach((page, index) =>
    validatePage(page, `$.pages[${index}]`, errors),
  );
  return pages;
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
