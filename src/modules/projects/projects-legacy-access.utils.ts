import {
  ProjectCollectionAccess,
  ProjectDocument,
} from './projects-legacy.imports';

export function groupByRoadmapVersionId<T extends { roadmapVersionId: string }>(
  items: T[],
) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const list = grouped.get(item.roadmapVersionId) ?? [];
    const documentLike = item as T & {
      toObject?: () => Record<string, unknown>;
    };
    list.push(documentLike.toObject ? documentLike.toObject() : { ...item });
    grouped.set(item.roadmapVersionId, list);
  }
  return grouped;
}
export function projectMatchesAccess(
  project: ProjectDocument,
  access: ProjectCollectionAccess,
) {
  if (
    project.accessRoleIds.some((roleId) => access.broadRoleIds.includes(roleId))
  ) {
    return true;
  }
  const scopedRoleIds =
    access.projectScopedRoleIdsByProjectId[project.id] ?? [];
  return project.accessRoleIds.some((roleId) => scopedRoleIds.includes(roleId));
}
