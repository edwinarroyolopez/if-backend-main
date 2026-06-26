import { DocumentImportPreviewResult } from './projects-legacy.imports';
import {
  ProjectDocumentPageReadModel,
  ProjectReadModel,
} from './projects-legacy.types';

export function coerceProjectReadModel(
  value: Record<string, unknown> | undefined,
): ProjectReadModel | null {
  if (!value) {
    return null;
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.organizationId !== 'string' ||
    typeof value.projectKind !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.health !== 'string' ||
    !Array.isArray(value.accessRoleIds)
  ) {
    return null;
  }
  return value as ProjectReadModel;
}

export function coerceDocumentPageReadModel(
  value: Record<string, unknown> | undefined,
): ProjectDocumentPageReadModel | null {
  if (!value) {
    return null;
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.organizationId !== 'string' ||
    typeof value.projectId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.slug !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.pageType !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.version !== 'number' ||
    typeof value.sortOrder !== 'number' ||
    !Array.isArray(value.checklist)
  ) {
    return null;
  }
  return value as ProjectDocumentPageReadModel;
}

export function coerceDocumentPageListResponse(
  value: Record<string, unknown> | undefined,
): { items: ProjectDocumentPageReadModel[] } | null {
  if (!value || !Array.isArray(value.items)) {
    return null;
  }
  const items = value.items
    .map((item) =>
      typeof item === 'object' && item !== null
        ? coerceDocumentPageReadModel(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ProjectDocumentPageReadModel => Boolean(item));
  if (items.length !== value.items.length) {
    return null;
  }
  return { items };
}

export function sanitizeDocumentImportPreview(
  preview: DocumentImportPreviewResult,
) {
  return {
    valid: preview.valid,
    previewToken: preview.previewToken,
    contractVersion: preview.contractVersion,
    promptTemplateVersion: preview.promptTemplateVersion,
    warnings: preview.warnings,
    errors: preview.errors,
    summary: preview.summary,
    pagesToCreate: preview.pagesToCreate,
  };
}

export function coerceDocumentImportCommitResponse(
  value: Record<string, unknown> | undefined,
): {
  committed: true;
  sourceImportId: string;
  summary: { pagesCreated: number; draftPagesCreated: number };
  pages: ProjectDocumentPageReadModel[];
} | null {
  if (!value || value.committed !== true || !Array.isArray(value.pages)) {
    return null;
  }
  if (
    typeof value.sourceImportId !== 'string' ||
    typeof value.summary !== 'object' ||
    value.summary === null
  ) {
    return null;
  }
  const summary = value.summary as Record<string, unknown>;
  if (
    typeof summary.pagesCreated !== 'number' ||
    typeof summary.draftPagesCreated !== 'number'
  ) {
    return null;
  }
  const pages = value.pages
    .map((item) =>
      typeof item === 'object' && item !== null
        ? coerceDocumentPageReadModel(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ProjectDocumentPageReadModel => Boolean(item));
  if (pages.length !== value.pages.length) {
    return null;
  }
  return {
    committed: true,
    sourceImportId: value.sourceImportId,
    summary: {
      pagesCreated: summary.pagesCreated,
      draftPagesCreated: summary.draftPagesCreated,
    },
    pages,
  };
}
