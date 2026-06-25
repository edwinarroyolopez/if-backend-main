import {
  ProjectKind,
  ProjectDocumentationChecklistItem,
  ProjectDocumentChecklistItem,
  ProjectDocumentPageSource,
  ProjectDocumentPageStatus,
  ProjectDocumentPageType,
  ProjectBacklogItemStatus,
  ProjectBacklogItemType,
  ProjectSprintItemBoardStatus,
  ProjectMembershipRole,
  ProjectMembershipStatus,
  ProjectRoadmapItem,
} from './projects-legacy.imports';

export type ProjectDocumentationUpdate = {
  parentPageId?: string;
  slug?: string;
  title?: string;
  summary?: string;
  bodyMarkdown?: string;
  pageType?:
    | 'OVERVIEW'
    | 'OBJECTIVES'
    | 'SCOPE'
    | 'TECHNOLOGIES'
    | 'ARCHITECTURE'
    | 'TEAM'
    | 'RISKS'
    | 'DEPENDENCIES'
    | 'DELIVERABLES'
    | 'DECISIONS'
    | 'CUSTOM';
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';
  sortOrder?: number;
  checklist?: ProjectDocumentationChecklistItem[];
};
export type ProjectRoadmapUpdate = {
  title?: string;
  status?: 'DRAFT' | 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'ARCHIVED';
  horizonMonths?: number;
  notes?: string;
  items?: ProjectRoadmapItem[];
};
export type ProjectDocumentPageInput = {
  parentPageId?: string;
  title: string;
  slug?: string;
  summary?: string;
  bodyMarkdown?: string;
  pageType?: ProjectDocumentPageType;
  status?: Extract<ProjectDocumentPageStatus, 'DRAFT' | 'IN_REVIEW'>;
  source?: ProjectDocumentPageSource;
  sortOrder?: number;
  checklist?: ProjectDocumentChecklistItem[];
  facts?: string[];
  assumptions?: string[];
  decisions?: string[];
  risks?: string[];
  openQuestions?: string[];
  sourceImportId?: string;
};
export type ProjectDocumentPageUpdate = Partial<
  Omit<ProjectDocumentPageInput, 'status' | 'source'>
> & { expectedVersion: number };
export type ProjectBacklogItemInput = {
  roadmapId: string;
  roadmapVersionId: string;
  milestoneId: string;
  milestoneKey: string;
  milestoneTitle: string;
  epicId: string;
  epicKey: string;
  epicTitle: string;
  title: string;
  description?: string;
  type: ProjectBacklogItemType;
  priority: number;
  estimate: Record<string, unknown>;
  status?: Exclude<ProjectBacklogItemStatus, 'ARCHIVED'>;
  acceptanceCriteria?: string[];
  sourceReferences?: Record<string, unknown>[];
  traceability?: Record<string, unknown>;
  order?: number;
  assigneeId?: string;
  sourceCandidateKey?: string;
};
export type ProjectBacklogItemUpdate = Partial<
  Pick<
    ProjectBacklogItemInput,
    | 'title'
    | 'description'
    | 'type'
    | 'priority'
    | 'estimate'
    | 'acceptanceCriteria'
    | 'sourceReferences'
    | 'traceability'
    | 'assigneeId'
  >
> & { status?: ProjectBacklogItemStatus; expectedVersion: number };
export type ProjectBacklogReorderItem = {
  id: string;
  order: number;
  expectedVersion: number;
};
export type ProjectSprintInput = {
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
};
export type ProjectSprintAddItemsInput = { backlogItemIds: string[] };
export type ProjectSprintBoardMoveInput = {
  itemId: string;
  toStatus: ProjectSprintItemBoardStatus;
  order: number;
  expectedVersion: number;
};
export type ProjectSprintRemoveItemInput = {
  itemId: string;
  expectedVersion: number;
};
export type ProjectMembershipInput = {
  userId?: string;
  displayName: string;
  email?: string;
  role: ProjectMembershipRole;
  capacity: number;
  status?: Extract<ProjectMembershipStatus, 'PLANNED' | 'ACTIVE'>;
};
export type ProjectMembershipUpdate = Partial<
  Pick<
    ProjectMembershipInput,
    'userId' | 'displayName' | 'email' | 'role' | 'capacity'
  >
> & { expectedVersion: number };
export type ProjectActivityQuery = {
  type?: string;
  resourceKind?: string;
  limit?: number;
  cursor?: string;
  from?: string;
  to?: string;
};
export type CreateProjectInput = {
  organizationId: string;
  projectKind?: ProjectKind;
  clientId?: string;
  opportunityId?: string;
  key?: string;
  name: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  startDate?: string;
  targetDate?: string;
  createdBy: string;
  accessRoleIds?: string[];
};
export type UpdateProjectDetailsInput = {
  name?: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  startDate?: string;
  targetDate?: string;
};
