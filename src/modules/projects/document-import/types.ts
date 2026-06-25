import type { ProjectDocumentPageType } from '../project-document-page.schema';
import type {
  DOCUMENTATION_PROMPT_TEMPLATE_VERSION,
  DOCUMENTATION_SCHEMA_VERSION,
  pageTypes,
} from './constants';

export type DocumentImportValidationIssue = {
  path: string;
  message: string;
};

export type DocumentImportWarning = {
  path: string;
  message: string;
};

export type TraceableStatement = {
  key: string;
  statement: string;
  sourceReferences: SourceReference[];
};

export type Decision = {
  key: string;
  decision: string;
  rationale: string;
  status: string;
  sourceReferences: SourceReference[];
};

export type Risk = {
  key: string;
  risk: string;
  impact: string;
  likelihood: string;
  mitigation: string;
  sourceReferences: SourceReference[];
};

export type OpenQuestion = {
  key: string;
  question: string;
  ownerHint?: string;
  sourceReferences: SourceReference[];
};

export type SourceReference = {
  referenceType: string;
  referenceKey: string;
  path?: string;
  quote?: string;
  confidence?: number;
};

export type ChecklistItem = {
  key: string;
  text: string;
  required: boolean;
  completed: boolean;
  order: number;
  sourceReferences: SourceReference[];
};

export type ImportPage = {
  clientReference: string;
  parentClientReference?: string;
  title: string;
  slug: string;
  pageType: (typeof pageTypes)[number];
  summary: string;
  bodyMarkdown: string;
  status: 'DRAFT';
  sortOrder?: number;
  checklist: ChecklistItem[];
  facts: TraceableStatement[];
  assumptions: TraceableStatement[];
  decisions: Decision[];
  risks: Risk[];
  openQuestions: OpenQuestion[];
  sourceReferences: SourceReference[];
};

export type DocumentationImportPayload = {
  schemaVersion: string;
  generationStatus: string;
  promptMetadata: {
    promptPurpose: string;
    promptTemplateVersion: string;
    contractVersion: string;
    promptChecksum?: string;
    generatedAt?: string;
  };
  projectIdentity: {
    projectName: string;
    projectKey: string;
    organizationHint?: string;
    clientHint?: string;
  };
  pages: ImportPage[];
  facts: TraceableStatement[];
  assumptions: TraceableStatement[];
  decisions: Decision[];
  risks: Risk[];
  openQuestions: OpenQuestion[];
  contradictions?: Array<{
    key: string;
    description: string;
    conflictingSourceReferences: SourceReference[];
  }>;
};

export type DocumentImportPagePlan = {
  clientReference: string;
  title: string;
  slug: string;
  pageType: ProjectDocumentPageType;
  sortOrder: number;
  checklistCount: number;
  factsCount: number;
  assumptionsCount: number;
  decisionsCount: number;
  risksCount: number;
  openQuestionsCount: number;
  sourceReferenceCount: number;
  summary: string;
};

export type DocumentImportNormalizedPage = DocumentImportPagePlan & {
  bodyMarkdown: string;
  checklist: Array<{
    id: string;
    text: string;
    required: boolean;
    completed: boolean;
  }>;
  facts: string[];
  assumptions: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
};

export type DocumentImportPreviewResult = {
  valid: true;
  previewToken: string;
  contractVersion: typeof DOCUMENTATION_SCHEMA_VERSION;
  promptTemplateVersion: typeof DOCUMENTATION_PROMPT_TEMPLATE_VERSION;
  warnings: DocumentImportWarning[];
  errors: DocumentImportValidationIssue[];
  summary: {
    pagesToCreate: number;
    checklistItems: number;
    facts: number;
    assumptions: number;
    decisions: number;
    risks: number;
    openQuestions: number;
  };
  pagesToCreate: DocumentImportPagePlan[];
  normalizedPages: DocumentImportNormalizedPage[];
};
