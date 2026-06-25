import { toPlainDocumentChecklistItem } from './projects-legacy-core.utils';
import { uniqueStrings } from './projects-legacy-value.utils';
import {
  createHash,
  ProjectDocument,
  ProjectDocumentPageVersionDocument,
} from './projects-legacy.imports';

export function buildContextSnapshotPlan(
  project: ProjectDocument,
  pageVersions: ProjectDocumentPageVersionDocument[],
) {
  const orderedVersions = [...pageVersions].sort((left, right) => {
    const bySortOrder = left.sortOrder - right.sortOrder;
    if (bySortOrder !== 0) {
      return bySortOrder;
    }
    return (
      left.slug.localeCompare(right.slug) ||
      left.pageId.localeCompare(right.pageId)
    );
  });
  const sourcePageIds = orderedVersions.map((version) => version.pageId);
  const sourcePageVersions = Object.fromEntries(
    orderedVersions.map((version) => [version.pageId, version.pageVersion]),
  );
  const hashInput = orderedVersions.map((version) => ({
    pageId: version.pageId,
    pageVersion: version.pageVersion,
    title: version.title,
    slug: version.slug,
    summary: version.summary ?? null,
    bodyMarkdown: version.bodyMarkdown ?? null,
    pageType: version.pageType,
    status: version.status,
    sortOrder: version.sortOrder,
    checklist: version.checklist.map(toPlainDocumentChecklistItem),
    facts: [...version.facts],
    assumptions: [...version.assumptions],
    decisions: [...version.decisions],
    risks: [...version.risks],
    openQuestions: [...version.openQuestions],
  }));
  const approvedDocumentationHash = createHash('sha256')
    .update(canonicalJson(hashInput))
    .digest('hex');
  const contentSummary = orderedVersions
    .map((version) =>
      `${version.title}: ${version.summary ?? version.bodyMarkdown ?? ''}`.trim(),
    )
    .filter(Boolean)
    .join('\n')
    .slice(0, 10000);
  return {
    snapshotKey: `ctx-${approvedDocumentationHash.slice(0, 16)}`,
    title: `Contexto aprobado - ${project.key}`,
    sourcePageIds,
    sourcePageVersions,
    approvedDocumentationHash,
    contentSummary,
    facts: uniqueStrings(orderedVersions.flatMap((version) => version.facts)),
    assumptions: uniqueStrings(
      orderedVersions.flatMap((version) => version.assumptions),
    ),
    decisions: uniqueStrings(
      orderedVersions.flatMap((version) => version.decisions),
    ),
    risks: uniqueStrings(orderedVersions.flatMap((version) => version.risks)),
    openQuestions: uniqueStrings(
      orderedVersions.flatMap((version) => version.openQuestions),
    ),
    constraints: uniqueStrings(
      orderedVersions.flatMap((version) =>
        version.checklist
          .filter((item) => item.required)
          .map((item) => item.text),
      ),
    ),
  };
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
