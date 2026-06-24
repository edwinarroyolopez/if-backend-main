export const USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'INVITED',
  'DELETED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CREDENTIAL_TYPES = ['PASSWORD', 'PASSKEY', 'RECOVERY'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const PRINCIPAL_TYPES = ['USER', 'SERVICE_ACCOUNT'] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const SESSION_KINDS = [
  'HUMAN',
  'SUPPORT_IMPERSONATION',
  'SERVICE_ACCOUNT',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const ROLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

export const ROLE_ASSIGNMENT_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
] as const;
export type RoleAssignmentStatus = (typeof ROLE_ASSIGNMENT_STATUSES)[number];

export const SCOPE_TYPES = [
  'ORGANIZATION',
  'MODULE',
  'PROJECT',
  'CLIENT',
  'MISSION',
  'MEDIA_BATCH',
  'SAMPLE',
  'DELIVERABLE',
  'INVOICE',
  'ENVIRONMENT',
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SERVICE_ACCOUNT_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
] as const;
export type ServiceAccountStatus = (typeof SERVICE_ACCOUNT_STATUSES)[number];

export const SERVICE_CREDENTIAL_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type ServiceCredentialStatus =
  (typeof SERVICE_CREDENTIAL_STATUSES)[number];

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const CLIENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const OPPORTUNITY_STATUSES = ['OPEN', 'CONVERTED', 'LOST'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const PROJECT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_KINDS = ['CLIENT', 'INTERNAL'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_HEALTH_STATUSES = [
  'ON_TRACK',
  'AT_RISK',
  'BLOCKED',
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH_STATUSES)[number];

export const PROJECT_READINESS_LEVELS = [
  'EMPTY',
  'DOCUMENTING',
  'DOCUMENTED',
  'ROADMAP_READY',
  'BACKLOG_READY',
  'READY_TO_START',
] as const;
export type ProjectReadinessLevel = (typeof PROJECT_READINESS_LEVELS)[number];

export const MISSION_STATUSES = [
  'DRAFT',
  'PLANNED',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MEDIA_BATCH_STATUSES = [
  'PENDING_INGEST',
  'INGESTED',
  'WAITING_SAMPLE',
  'PROCESSING',
  'QC',
  'COMPLETED',
  'FAILED',
] as const;
export type MediaBatchStatus = (typeof MEDIA_BATCH_STATUSES)[number];

export const SAMPLE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const DELIVERABLE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'DELIVERED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const INVOICE_REQUEST_STATUSES = [
  'DRAFT',
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type InvoiceRequestStatus = (typeof INVOICE_REQUEST_STATUSES)[number];

export const OUTBOX_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTER',
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ['USER', 'SERVICE_ACCOUNT', 'SYSTEM'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_DECISIONS = ['ALLOW', 'DENY'] as const;
export type AuditDecision = (typeof AUDIT_DECISIONS)[number];
