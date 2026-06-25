import {
  AppException,
  buildSlugKeyFromName,
  DocumentImportPreviewResult,
  normalizeProjectKey,
  normalizeSlugKey,
  ProjectDocument,
  ProjectDocumentChecklistItem,
  ProjectDocumentPageDocument,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  CreateProjectInput,
  ProjectDocumentPageReadModel,
  ProjectReadModel,
  UpdateProjectDetailsInput,
} from './projects-legacy.types';

export function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
export function resolveProjectKey(
  input: Pick<CreateProjectInput, 'key' | 'name'>,
) {
  const source = input.key?.trim() ? input.key : input.name;
  const normalizedKey = normalizeProjectKey(
    input.key?.trim() ? source : buildSlugKeyFromName(source),
  );
  if (!normalizedKey) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Project key could not be generated from name',
      { field: input.key?.trim() ? 'key' : 'name' },
    );
  }
  return normalizedKey;
}
export function parseProjectDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return new Date(`${value}T00:00:00.000Z`);
}
export function toIsoDate(value: Date | undefined) {
  return value ? value.toISOString().slice(0, 10) : undefined;
}
export const documentTraceabilityFields = [
  'facts',
  'assumptions',
  'decisions',
  'risks',
  'openQuestions',
] as const;
export function resolveDocumentPageSlug(
  slug: string | undefined,
  title: string,
) {
  const source = slug?.trim() ? slug : title;
  const normalizedSlug = normalizeSlugKey(
    slug?.trim() ? source : buildSlugKeyFromName(source),
  );
  if (!normalizedSlug) {
    throw new AppException(
      400,
      REASON_CODES.VALIDATION_FAILED,
      'Document page slug could not be generated',
      { field: slug?.trim() ? 'slug' : 'title' },
    );
  }
  return normalizedSlug;
}
export function normalizeDocumentChecklist(
  checklist: ProjectDocumentChecklistItem[] | undefined,
) {
  if (!checklist) {
    return [];
  }
  return checklist.map((item) => ({
    id: item.id.trim(),
    text: item.text.trim(),
    required: item.required,
    completed: item.completed,
  }));
}
export function toPlainDocumentChecklistItem(
  item: ProjectDocumentChecklistItem,
) {
  return {
    id: item.id,
    text: item.text,
    required: item.required,
    completed: item.completed,
  };
}
export function normalizeStringList(values: string[] | undefined) {
  if (!values) {
    return [];
  }
  return values.map((value) => value.trim()).filter(Boolean);
}
export function areStringListsEqual(current: string[], next: string[]) {
  return (
    current.length === next.length &&
    current.every((value, index) => value === next[index])
  );
}
export function areDocumentChecklistsEqual(
  current: ProjectDocumentChecklistItem[],
  next: ProjectDocumentChecklistItem[],
) {
  if (current.length !== next.length) {
    return false;
  }
  return current.every(
    (item, index) =>
      item.id === next[index].id &&
      item.text === next[index].text &&
      item.required === next[index].required &&
      item.completed === next[index].completed,
  );
}
export function assertExpectedDocumentPageVersion(
  page: ProjectDocumentPageDocument,
  expectedVersion: number,
) {
  if (page.version !== expectedVersion) {
    throw new AppException(
      409,
      REASON_CODES.RESOURCE_STATE_CONFLICT,
      'Document page version conflict',
      { expectedVersion, currentVersion: page.version },
    );
  }
}
export function isUsefulDocumentPage(page: ProjectDocumentPageDocument) {
  return (
    (page.bodyMarkdown?.trim().length ?? 0) > 0 ||
    page.checklist.length > 0 ||
    (page.summary?.trim().length ?? 0) > 0
  );
}
export function applyProjectDetails(
  project: ProjectDocument,
  updates: UpdateProjectDetailsInput,
) {
  let changed = false;
  if (updates.name !== undefined && updates.name.trim() !== project.name) {
    project.name = updates.name.trim();
    changed = true;
  }
  const optionalTextFields = [
    'description',
    'objective',
    'ownerUserId',
  ] as const;
  for (const field of optionalTextFields) {
    if (updates[field] === undefined) {
      continue;
    }
    const nextValue = normalizeOptionalText(updates[field]);
    if (nextValue !== project[field]) {
      project[field] = nextValue;
      changed = true;
    }
  }
  const dateFields = ['startDate', 'targetDate'] as const;
  for (const field of dateFields) {
    if (updates[field] === undefined) {
      continue;
    }
    const nextValue = parseProjectDate(updates[field]);
    if (toIsoDate(nextValue) !== toIsoDate(project[field])) {
      project[field] = nextValue;
      changed = true;
    }
  }
  return changed;
}
export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
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
