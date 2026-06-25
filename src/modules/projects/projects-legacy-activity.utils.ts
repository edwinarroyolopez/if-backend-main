import { PROJECT_ACTIVITY_EVENT_DEFINITIONS } from './projects-legacy-activity-definitions';
import {
  readArray,
  readNumber,
  readSafeScalar,
  readString,
} from './projects-legacy-value.utils';
import { AuditReadRecord } from './projects-legacy.imports';
import {
  ProjectActivityEventReadModel,
  ProjectActivityResourceReadModel,
} from './projects-legacy.types';

export function mapAuditToProjectActivity(
  projectId: string,
  audit: AuditReadRecord,
  projectRoadmapIds: Set<string>,
): ProjectActivityEventReadModel | null {
  const definition = PROJECT_ACTIVITY_EVENT_DEFINITIONS[audit.action];
  if (!definition || !audit.organizationId) return null;
  const auditProjectId = getAuditProjectId(audit);
  const roadmapBelongsToProject =
    audit.resourceType === 'PROJECT_ROADMAP' &&
    projectRoadmapIds.has(audit.resourceId);
  if (!roadmapBelongsToProject && auditProjectId !== projectId) return null;
  const label = resolveActivityLabel(audit, definition.resourceKind);
  const resource = buildActivityResource(
    projectId,
    definition.resourceKind,
    audit.resourceId,
    label,
  );
  return {
    id: audit.id,
    organizationId: audit.organizationId,
    projectId,
    type: definition.type,
    category: definition.category,
    title: definition.title,
    summary: buildActivitySummary(audit, definition.type, label),
    actor: { id: audit.actorId },
    occurredAt: audit.createdAt.toISOString(),
    resource,
    relatedResources: buildRelatedActivityResources(
      projectId,
      definition.category,
    ),
    metadata: buildSafeActivityMetadata(audit, definition.type),
  };
}
export function getAuditProjectId(audit: AuditReadRecord) {
  if (audit.resourceType === 'PROJECT') return audit.resourceId;
  const metadataProjectId = readString(audit.metadata, 'projectId');
  if (metadataProjectId) return metadataProjectId;
  const afterProjectId = readString(audit.after, 'projectId');
  if (afterProjectId) return afterProjectId;
  const beforeProjectId = readString(audit.before, 'projectId');
  if (beforeProjectId) return beforeProjectId;
  return undefined;
}
export function resolveActivityLabel(
  audit: AuditReadRecord,
  resourceKind: string,
) {
  if (resourceKind === 'PROJECT') {
    return readString(audit.after, 'key') ?? readString(audit.after, 'name');
  }
  return (
    readString(audit.after, 'title') ??
    readString(audit.after, 'name') ??
    readString(audit.after, 'snapshotKey') ??
    readString(audit.after, 'status') ??
    audit.resourceId
  );
}
export function buildActivitySummary(
  audit: AuditReadRecord,
  type: string,
  label?: string,
) {
  switch (type) {
    case 'DOCUMENTATION_IMPORTED': {
      const pageCount = readArray(audit.after, 'pageIds')?.length ?? 0;
      return `Se importaron ${pageCount} paginas documentales.`;
    }
    case 'CONTEXT_SNAPSHOT_CREATED':
      return `Snapshot ${label ?? audit.resourceId} creado desde documentacion aprobada.`;
    case 'ROADMAP_IMPORTED':
      return 'Se importo una version de roadmap desde snapshot aprobado.';
    case 'ROADMAP_ACTIVATED':
      return 'Se activo una version del roadmap.';
    case 'BACKLOG_IMPORTED': {
      const created = readNumber(audit.after, 'created') ?? 0;
      const skipped = readNumber(audit.after, 'skipped') ?? 0;
      return `Backlog importado: ${created} creados, ${skipped} omitidos.`;
    }
    case 'SPRINT_ITEMS_ADDED': {
      const added = readNumber(audit.after, 'added') ?? 0;
      return `${added} items de backlog fueron agregados al sprint.`;
    }
    case 'SPRINT_BOARD_MOVED': {
      const status = readString(audit.after, 'boardStatus');
      return `Card movida${status ? ` a ${status}` : ''}.`;
    }
    case 'TEAM_MEMBER_CREATED':
      return `${label ?? 'Miembro'} agregado al equipo operativo.`;
    case 'TEAM_MEMBER_UPDATED':
      return `${label ?? 'Miembro'} actualizado en equipo operativo.`;
    case 'TEAM_MEMBER_DEACTIVATED':
      return `${label ?? 'Miembro'} desactivado del equipo operativo.`;
    case 'TEAM_MEMBER_ACTIVATED':
      return `${label ?? 'Miembro'} activado en equipo operativo.`;
    default:
      return label ? `${label}` : 'Evento registrado en Project OS.';
  }
}
export function buildActivityResource(
  projectId: string,
  kind: string,
  id: string,
  label?: string,
): ProjectActivityResourceReadModel {
  return { kind, id, label, href: hrefForActivityResource(projectId, kind) };
}
export function buildRelatedActivityResources(
  projectId: string,
  category: string,
) {
  const resources: ProjectActivityResourceReadModel[] = [
    {
      kind: 'PROJECT',
      id: projectId,
      label: 'Project Hub',
      href: `/projects/${projectId}`,
    },
  ];
  if (category === 'DOCUMENTATION' || category === 'SNAPSHOT') {
    resources.push({
      kind: 'DOCUMENTATION',
      label: 'Documentacion',
      href: `/projects/${projectId}/documentation`,
    });
  }
  if (category === 'ROADMAP') {
    resources.push({
      kind: 'ROADMAP',
      label: 'Roadmap',
      href: `/projects/${projectId}/roadmap`,
    });
  }
  if (category === 'BACKLOG') {
    resources.push({
      kind: 'BACKLOG',
      label: 'Backlog',
      href: `/projects/${projectId}/backlog`,
    });
  }
  if (category === 'SCRUM') {
    resources.push({
      kind: 'SPRINT',
      label: 'Scrum',
      href: `/projects/${projectId}/scrum`,
    });
  }
  if (category === 'TEAM') {
    resources.push({
      kind: 'TEAM_MEMBER',
      label: 'Equipo',
      href: `/projects/${projectId}/team`,
    });
  }
  return resources;
}
export function hrefForActivityResource(projectId: string, kind: string) {
  if (
    kind === 'DOCUMENT_PAGE' ||
    kind === 'DOCUMENTATION' ||
    kind === 'CONTEXT_SNAPSHOT'
  ) {
    return `/projects/${projectId}/documentation`;
  }
  if (kind === 'ROADMAP') return `/projects/${projectId}/roadmap`;
  if (kind === 'BACKLOG' || kind === 'BACKLOG_ITEM')
    return `/projects/${projectId}/backlog`;
  if (kind === 'SPRINT' || kind === 'SPRINT_ITEM')
    return `/projects/${projectId}/scrum`;
  if (kind === 'TEAM_MEMBER') return `/projects/${projectId}/team`;
  if (kind === 'ACTIVITY') return `/projects/${projectId}/activity`;
  return `/projects/${projectId}`;
}
export function buildSafeActivityMetadata(
  audit: AuditReadRecord,
  type: string,
) {
  const metadata: Record<string, unknown> = { auditAction: audit.action };
  const after = audit.after;
  for (const key of [
    'status',
    'version',
    'snapshotKey',
    'roadmapVersionId',
    'activeVersionId',
    'created',
    'skipped',
    'added',
    'boardStatus',
    'order',
    'role',
    'capacity',
  ]) {
    const value = readSafeScalar(after, key);
    if (value !== undefined) metadata[key] = value;
  }
  const pageIds = readArray(after, 'pageIds');
  if (pageIds) metadata.pageCount = pageIds.length;
  if (type === 'SPRINT_BOARD_MOVED') {
    metadata.previousBoardStatus = readString(audit.before, 'boardStatus');
  }
  return metadata;
}
