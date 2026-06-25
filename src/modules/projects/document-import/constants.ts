export const DOCUMENTATION_SCHEMA_VERSION = 'inflight.project.documentation.v1';
export const DOCUMENTATION_PROMPT_TEMPLATE_VERSION =
  'project-documentation-interview-v1';
export const DOCUMENTATION_PROMPT_PURPOSE = 'PROJECT_DOCUMENTATION_INTERVIEW';

export const pageTypes = [
  'OVERVIEW',
  'OBJECTIVES',
  'SCOPE',
  'TECHNOLOGIES',
  'ARCHITECTURE',
  'TEAM',
  'RISKS',
  'DEPENDENCIES',
  'DELIVERABLES',
  'DECISIONS',
  'CUSTOM',
] as const;

export const generationStatuses = [
  'READY',
  'NEEDS_USER_INPUT',
  'CONTRADICTIONS_FOUND',
  'CANNOT_COMPLY',
] as const;

export const sourceReferenceTypes = [
  'INITIAL_DESCRIPTION',
  'USER_ANSWER',
  'EXTERNAL_DOCUMENT',
  'MEETING_NOTE',
  'ASSUMPTION',
  'DECISION',
] as const;

export const decisionStatuses = [
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
];
export const riskImpacts = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const riskLikelihoods = ['LOW', 'MEDIUM', 'HIGH'];

export const rootKeys = [
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
  'contradictions',
];
export const promptMetadataKeys = [
  'promptPurpose',
  'promptTemplateVersion',
  'contractVersion',
  'promptChecksum',
  'generatedAt',
];
export const projectIdentityKeys = [
  'projectName',
  'projectKey',
  'organizationHint',
  'clientHint',
];
export const pageKeys = [
  'clientReference',
  'parentClientReference',
  'title',
  'slug',
  'pageType',
  'summary',
  'bodyMarkdown',
  'status',
  'sortOrder',
  'checklist',
  'facts',
  'assumptions',
  'decisions',
  'risks',
  'openQuestions',
  'sourceReferences',
];
export const checklistKeys = [
  'key',
  'text',
  'required',
  'completed',
  'order',
  'sourceReferences',
];
export const sourceReferenceKeys = [
  'referenceType',
  'referenceKey',
  'path',
  'quote',
  'confidence',
];
export const statementKeys = ['key', 'statement', 'sourceReferences'];
export const decisionKeys = [
  'key',
  'decision',
  'rationale',
  'status',
  'sourceReferences',
];
export const riskKeys = [
  'key',
  'risk',
  'impact',
  'likelihood',
  'mitigation',
  'sourceReferences',
];
export const openQuestionKeys = [
  'key',
  'question',
  'ownerHint',
  'sourceReferences',
];
export const contradictionKeys = [
  'key',
  'description',
  'conflictingSourceReferences',
];
