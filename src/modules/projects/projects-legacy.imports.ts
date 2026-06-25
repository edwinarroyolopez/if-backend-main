export { createHash } from 'crypto';
export type { ClientSession, Model } from 'mongoose';
export type { OnModuleInit } from '@nestjs/common';
export { ConfigService } from '@nestjs/config';
export { AppException } from 'src/common/errors/app-exception';
export { REASON_CODES } from 'src/common/errors/reason-codes';
export type { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
export type {
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from 'src/common/types/domain.types';
export {
  buildSlugKeyFromName,
  normalizeSlugKey,
} from 'src/common/utils/slug-key.util';
export { CrmService } from 'src/modules/crm/crm.service';
export { AccessControlService } from 'src/platform/access-control/access-control.service';
export { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
export type { ProjectCollectionAccess } from 'src/platform/access-control/principal-authorization.service';
export { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
export type {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
export { AuditService } from 'src/platform/audit/audit.service';
export type { AuditReadRecord } from 'src/platform/audit/audit.service';
export { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
export {
  buildProjectReadiness,
  canTransitionProject,
  normalizeProjectKey,
  normalizeProjectKind,
} from './project-foundation.policy';
export type { ProjectReadiness } from './project-foundation.policy';
export { Project } from './project.schema';
export type { ProjectDocument } from './project.schema';
export { ProjectDocumentation } from './project-documentation.schema';
export type {
  ProjectDocumentationChecklistItem,
  ProjectDocumentationDocument,
} from './project-documentation.schema';
export {
  PROJECT_DOCUMENT_PAGE_TYPES,
  ProjectDocumentPage,
} from './project-document-page.schema';
export type {
  ProjectDocumentChecklistItem,
  ProjectDocumentPageDocument,
  ProjectDocumentPageSource,
  ProjectDocumentPageStatus,
  ProjectDocumentPageType,
} from './project-document-page.schema';
export { ProjectDocumentPageVersion } from './project-document-page-version.schema';
export type { ProjectDocumentPageVersionDocument } from './project-document-page-version.schema';
export { ProjectContextSnapshot } from './project-context-snapshot.schema';
export type { ProjectContextSnapshotDocument } from './project-context-snapshot.schema';
export {
  PROJECT_BACKLOG_ITEM_STATUSES,
  PROJECT_BACKLOG_ITEM_TYPES,
  ProjectBacklogItem,
} from './project-backlog-item.schema';
export type {
  ProjectBacklogItemDocument,
  ProjectBacklogItemStatus,
  ProjectBacklogItemType,
} from './project-backlog-item.schema';
export {
  PROJECT_SPRINT_ITEM_BOARD_STATUSES,
  ProjectSprintItem,
} from './project-sprint-item.schema';
export type {
  ProjectSprintItemBoardStatus,
  ProjectSprintItemDocument,
} from './project-sprint-item.schema';
export {
  PROJECT_MEMBERSHIP_ROLES,
  ProjectMembership,
} from './project-membership.schema';
export type {
  ProjectMembershipDocument,
  ProjectMembershipRole,
  ProjectMembershipStatus,
} from './project-membership.schema';
export { ProjectSprint } from './project-sprint.schema';
export type {
  ProjectSprintDocument,
  ProjectSprintStatus,
} from './project-sprint.schema';
export { ProjectRoadmap } from './project-roadmap.schema';
export type {
  ProjectRoadmapDocument,
  ProjectRoadmapItem,
} from './project-roadmap.schema';
export { ProjectRoadmapEpic } from './project-roadmap-epic.schema';
export type { ProjectRoadmapEpicDocument } from './project-roadmap-epic.schema';
export { ProjectRoadmapImport } from './project-roadmap-import.schema';
export type { ProjectRoadmapImportDocument } from './project-roadmap-import.schema';
export { ProjectRoadmapMilestone } from './project-roadmap-milestone.schema';
export type { ProjectRoadmapMilestoneDocument } from './project-roadmap-milestone.schema';
export { ProjectRoadmapVersion } from './project-roadmap-version.schema';
export type { ProjectRoadmapVersionDocument } from './project-roadmap-version.schema';
export {
  assertDocumentImportPreviewToken,
  buildDocumentationPromptResponse,
  buildDocumentImportPreview,
} from './project-document-import.validator';
export type { DocumentImportPreviewResult } from './project-document-import.validator';
