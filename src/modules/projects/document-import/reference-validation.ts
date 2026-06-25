import type {
  Decision,
  DocumentationImportPayload,
  DocumentImportValidationIssue,
  OpenQuestion,
  Risk,
  SourceReference,
  TraceableStatement,
} from './types';

export function validateReferences(
  payload: DocumentationImportPayload,
  rootFacts: TraceableStatement[],
  rootAssumptions: TraceableStatement[],
  rootDecisions: Decision[],
  rootRisks: Risk[],
  rootOpenQuestions: OpenQuestion[],
  errors: DocumentImportValidationIssue[],
) {
  const assumptionKeys = new Set(rootAssumptions.map((item) => item.key));
  const decisionKeys = new Set(rootDecisions.map((item) => item.key));
  const rootCollections = [
    rootFacts,
    rootAssumptions,
    rootDecisions,
    rootRisks,
    rootOpenQuestions,
  ];
  rootCollections.forEach((collection) => {
    collection.forEach((item) =>
      validateReferenceList(
        item.sourceReferences,
        '$',
        assumptionKeys,
        decisionKeys,
        errors,
      ),
    );
  });
  payload.pages.forEach((page, pageIndex) => {
    page.assumptions.forEach((item) => assumptionKeys.add(item.key));
    page.decisions.forEach((item) => decisionKeys.add(item.key));
    validateReferenceList(
      page.sourceReferences,
      `$.pages[${pageIndex}].sourceReferences`,
      assumptionKeys,
      decisionKeys,
      errors,
    );
    page.checklist.forEach((item, itemIndex) =>
      validateReferenceList(
        item.sourceReferences,
        `$.pages[${pageIndex}].checklist[${itemIndex}].sourceReferences`,
        assumptionKeys,
        decisionKeys,
        errors,
      ),
    );
    [
      ...page.facts,
      ...page.assumptions,
      ...page.decisions,
      ...page.risks,
      ...page.openQuestions,
    ].forEach((item) =>
      validateReferenceList(
        item.sourceReferences,
        `$.pages[${pageIndex}]`,
        assumptionKeys,
        decisionKeys,
        errors,
      ),
    );
  });
}

function validateReferenceList(
  references: SourceReference[],
  path: string,
  assumptionKeys: Set<string>,
  decisionKeys: Set<string>,
  errors: DocumentImportValidationIssue[],
) {
  references.forEach((reference, index) => {
    if (
      reference.referenceType === 'ASSUMPTION' &&
      !assumptionKeys.has(reference.referenceKey)
    ) {
      errors.push({
        path: `${path}[${index}].referenceKey`,
        message: `Reference key ${reference.referenceKey} does not match any assumption in the payload.`,
      });
    }
    if (
      reference.referenceType === 'DECISION' &&
      !decisionKeys.has(reference.referenceKey)
    ) {
      errors.push({
        path: `${path}[${index}].referenceKey`,
        message: `Reference key ${reference.referenceKey} does not match any decision in the payload.`,
      });
    }
  });
}
