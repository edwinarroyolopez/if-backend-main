import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { ProjectReadModel } from '../projects.service';
import {
  DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
  DOCUMENTATION_SCHEMA_VERSION,
} from './constants';
import { normalizeImportPages, toPlanPage } from './normalization';
import { buildPreviewToken } from './preview-token';
import { validateDocumentImportShape } from './shape-validation';
import type {
  DocumentImportNormalizedPage,
  DocumentImportPreviewResult,
  DocumentImportValidationIssue,
  DocumentImportWarning,
} from './types';

export function buildDocumentImportPreview(
  project: ProjectReadModel,
  documentImport: unknown,
  existingSlugs: string[],
  previewTokenSecret: string,
): DocumentImportPreviewResult {
  const errors: DocumentImportValidationIssue[] = [];
  const warnings: DocumentImportWarning[] = [];
  const payload = validateDocumentImportShape(documentImport, errors);
  if (!payload) {
    throwValidation(errors);
  }

  if (payload.projectIdentity.projectKey !== project.key) {
    warnings.push({
      path: '$.projectIdentity.projectKey',
      message: `Payload projectKey ${payload.projectIdentity.projectKey} differs from project ${project.key}.`,
    });
  }

  const normalizedPages = normalizeImportPages(payload, errors, warnings);
  const seenSlugs = new Map<string, string>();
  for (const page of normalizedPages) {
    const previousPath = seenSlugs.get(page.slug);
    if (previousPath) {
      errors.push({
        path: `$.pages[${page.sortOrder}].slug`,
        message: `Duplicate normalized slug ${page.slug}; first seen at ${previousPath}.`,
      });
    } else {
      seenSlugs.set(page.slug, `$.pages[${page.sortOrder}].slug`);
    }
  }

  const existingSlugSet = new Set(existingSlugs);
  normalizedPages.forEach((page, index) => {
    if (existingSlugSet.has(page.slug)) {
      errors.push({
        path: `$.pages[${index}].slug`,
        message: `Slug ${page.slug} already exists in this project.`,
      });
    }
  });

  if (errors.length > 0) {
    throwValidation(errors);
  }

  const pagesToCreate = normalizedPages.map(toPlanPage);
  return {
    valid: true,
    previewToken: buildPreviewToken(
      project.id,
      normalizedPages,
      previewTokenSecret,
    ),
    contractVersion: DOCUMENTATION_SCHEMA_VERSION,
    promptTemplateVersion: DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
    warnings,
    errors: [],
    summary: {
      pagesToCreate: normalizedPages.length,
      checklistItems: normalizedPages.reduce(
        (total, page) => total + page.checklistCount,
        0,
      ),
      facts: normalizedPages.reduce(
        (total, page) => total + page.factsCount,
        0,
      ),
      assumptions: normalizedPages.reduce(
        (total, page) => total + page.assumptionsCount,
        0,
      ),
      decisions: normalizedPages.reduce(
        (total, page) => total + page.decisionsCount,
        0,
      ),
      risks: normalizedPages.reduce(
        (total, page) => total + page.risksCount,
        0,
      ),
      openQuestions: normalizedPages.reduce(
        (total, page) => total + page.openQuestionsCount,
        0,
      ),
    },
    pagesToCreate,
    normalizedPages,
  };
}

export function assertDocumentImportPreviewToken(
  projectId: string,
  normalizedPages: DocumentImportNormalizedPage[],
  previewToken: string,
  previewTokenSecret: string,
) {
  const expected = buildPreviewToken(
    projectId,
    normalizedPages,
    previewTokenSecret,
  );
  if (previewToken !== expected) {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'Preview token does not match the validated document import payload',
      { field: 'previewToken' },
    );
  }
}

function throwValidation(errors: DocumentImportValidationIssue[]): never {
  throw new AppException(
    400,
    REASON_CODES.VALIDATION_FAILED,
    'Document import JSON failed validation',
    { errors },
  );
}
