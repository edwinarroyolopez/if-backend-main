import {
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
  ProjectDocumentChecklistItem,
  ProjectDocumentPageSource,
  ProjectDocumentPageStatus,
  ProjectDocumentPageType,
  ProjectBacklogItemStatus,
  ProjectBacklogItemType,
  ProjectSprintItemBoardStatus,
  ProjectSprintStatus,
  ProjectMembershipRole,
  ProjectMembershipStatus,
} from './projects-legacy.imports';

export type RoadmapImportIssue = { path: string; message: string };
export type ProjectDocumentPageReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  parentPageId?: string;
  title: string;
  slug: string;
  summary?: string;
  bodyMarkdown?: string;
  pageType: ProjectDocumentPageType;
  status: ProjectDocumentPageStatus;
  source: ProjectDocumentPageSource;
  sortOrder: number;
  version: number;
  checklist: ProjectDocumentChecklistItem[];
  facts: string[];
  assumptions: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  sourceImportId?: string;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectContextSnapshotReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  snapshotKey: string;
  title: string;
  sourcePageIds: string[];
  sourcePageVersions: Record<string, number>;
  approvedDocumentationHash: string;
  contentSummary: string;
  facts: string[];
  assumptions: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  constraints: string[];
  createdBy: string;
  createdAt?: string;
};
export type ProjectRoadmapVersionReadModel = {
  id: string;
  roadmapId: string;
  projectId: string;
  snapshotId: string;
  snapshotKey: string;
  snapshotHash: string;
  title: string;
  versionLabel: string;
  versionNumber: number;
  startDate: string;
  endDate: string;
  status: string;
  planningAssumptions: Record<string, unknown>[];
  constraints: Record<string, unknown>[];
  horizons: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  epics: Record<string, unknown>[];
  backlogCandidates: Record<string, unknown>[];
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectRoadmapReadModel = {
  id: string;
  organizationId?: string;
  projectId: string;
  title: string;
  status: string;
  activeVersionId?: string;
  latestVersionId?: string;
  activeVersion?: ProjectRoadmapVersionReadModel;
  versions: ProjectRoadmapVersionReadModel[];
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectBacklogItemReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  roadmapId: string;
  roadmapVersionId: string;
  milestoneId: string;
  milestoneKey: string;
  milestoneTitle: string;
  epicId: string;
  epicKey: string;
  epicTitle: string;
  title: string;
  description: string;
  type: ProjectBacklogItemType;
  priority: number;
  estimate: Record<string, unknown>;
  status: ProjectBacklogItemStatus;
  acceptanceCriteria: string[];
  sourceReferences: Record<string, unknown>[];
  traceability: Record<string, unknown>;
  order: number;
  assigneeId?: string;
  sourceCandidateKey?: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string;
};
export type ProjectBacklogCandidatePreview = Omit<
  ProjectBacklogItemReadModel,
  | 'id'
  | 'organizationId'
  | 'projectId'
  | 'status'
  | 'version'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'archivedAt'
> & {
  status: Extract<ProjectBacklogItemStatus, 'UNREFINED' | 'READY'>;
  alreadyImported: boolean;
};
export type ProjectBacklogImportPreviewReadModel = {
  valid: boolean;
  previewToken: string;
  roadmapId: string;
  roadmapVersionId: string;
  roadmapVersionLabel: string;
  snapshotId: string;
  warnings: RoadmapImportIssue[];
  errors: RoadmapImportIssue[];
  summary: { candidates: number; alreadyImported: number; willCreate: number };
  candidates: ProjectBacklogCandidatePreview[];
};
export type ProjectSprintItemReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  sprintId: string;
  backlogItemId: string;
  roadmapId: string;
  roadmapVersionId: string;
  milestoneId: string;
  epicId: string;
  title: string;
  description: string;
  type: ProjectBacklogItemType;
  priority: number;
  estimate: Record<string, unknown>;
  boardStatus: ProjectSprintItemBoardStatus;
  order: number;
  version: number;
  sourceBacklogVersion: number;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectSprintReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  goal: string;
  status: ProjectSprintStatus;
  startDate?: string;
  endDate?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  active: boolean;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
  items: ProjectSprintItemReadModel[];
};
export type ProjectMembershipReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  userId?: string;
  displayName: string;
  email?: string;
  role: ProjectMembershipRole;
  capacity: number;
  capacityUnit: 'HOURS_PER_WEEK';
  status: ProjectMembershipStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
  deactivatedAt?: string;
};
export type ProjectTeamReadModel = {
  items: ProjectMembershipReadModel[];
  capacityUnit: 'HOURS_PER_WEEK';
  activeCapacity: number;
};
export type ProjectActivityResourceReadModel = {
  kind: string;
  id?: string;
  label?: string;
  href?: string;
};
export type ProjectActivityEventReadModel = {
  id: string;
  organizationId: string;
  projectId: string;
  type: string;
  category: string;
  title: string;
  summary: string;
  actor: { id?: string; displayName?: string; email?: string };
  occurredAt: string;
  resource: ProjectActivityResourceReadModel;
  relatedResources?: ProjectActivityResourceReadModel[];
  metadata?: Record<string, unknown>;
};
export type ProjectActivityReadModel = {
  items: ProjectActivityEventReadModel[];
  nextCursor?: string;
};
export type ProjectReadModel = {
  id: string;
  organizationId: string;
  projectKind: ProjectKind;
  clientId?: string;
  opportunityId?: string;
  key: string;
  name: string;
  description?: string;
  objective?: string;
  ownerUserId?: string;
  status: ProjectStatus;
  health: ProjectHealth;
  healthReason?: string;
  healthUpdatedAt?: string;
  healthUpdatedBy?: string;
  startDate?: string;
  targetDate?: string;
  accessRoleIds: string[];
  accessPolicyVersion: number;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};
