import { normalizeSlugKey } from 'src/common/utils/slug-key.util';
import type {
  DocumentationImportPayload,
  DocumentImportNormalizedPage,
  DocumentImportPagePlan,
  DocumentImportValidationIssue,
  DocumentImportWarning,
} from './types';

export function normalizeImportPages(
  payload: DocumentationImportPayload,
  errors: DocumentImportValidationIssue[],
  warnings: DocumentImportWarning[],
): DocumentImportNormalizedPage[] {
  return payload.pages.map((page, index) => {
    const normalizedSlug = normalizeSlugKey(page.slug);
    if (!normalizedSlug) {
      errors.push({
        path: `$.pages[${index}].slug`,
        message: 'Slug normalizes to an empty value.',
      });
    } else if (normalizedSlug !== page.slug) {
      warnings.push({
        path: `$.pages[${index}].slug`,
        message: `Slug will be normalized from ${page.slug} to ${normalizedSlug}.`,
      });
    }
    return {
      clientReference: page.clientReference,
      title: page.title.trim(),
      slug: normalizedSlug,
      pageType: page.pageType,
      sortOrder: page.sortOrder ?? index,
      checklistCount: page.checklist.length,
      factsCount: page.facts.length,
      assumptionsCount: page.assumptions.length,
      decisionsCount: page.decisions.length,
      risksCount: page.risks.length,
      openQuestionsCount: page.openQuestions.length,
      sourceReferenceCount: page.sourceReferences.length,
      summary: page.summary.trim(),
      bodyMarkdown: page.bodyMarkdown.trim(),
      checklist: page.checklist.map((item) => ({
        id: item.key,
        text: item.text.trim(),
        required: item.required,
        completed: item.completed,
      })),
      facts: page.facts.map((item) => item.statement.trim()),
      assumptions: page.assumptions.map((item) => item.statement.trim()),
      decisions: page.decisions.map((item) => item.decision.trim()),
      risks: page.risks.map((item) => item.risk.trim()),
      openQuestions: page.openQuestions.map((item) => item.question.trim()),
    };
  });
}

export function toPlanPage(
  page: DocumentImportNormalizedPage,
): DocumentImportPagePlan {
  return {
    clientReference: page.clientReference,
    title: page.title,
    slug: page.slug,
    pageType: page.pageType,
    sortOrder: page.sortOrder,
    checklistCount: page.checklistCount,
    factsCount: page.factsCount,
    assumptionsCount: page.assumptionsCount,
    decisionsCount: page.decisionsCount,
    risksCount: page.risksCount,
    openQuestionsCount: page.openQuestionsCount,
    sourceReferenceCount: page.sourceReferenceCount,
    summary: page.summary,
  };
}
