export const PERMISSION_REGISTRY = [
  'crm.client.read',
  'crm.client.create',
  'sales.opportunity.create',
  'sales.opportunity.convert_to_project',
  'projects.project.read',
  'projects.project.create',
  'projects.project.assign_roles',
  'flight.mission.read',
  'flight.mission.create',
  'flight.mission.complete',
  'image.media_batch.ingest',
  'image.sample.approve',
  'deliverables.deliverable.create',
  'deliverables.deliverable.approve',
  'finance.invoice.request',
  'finance.invoice.approve',
  'admin.role.create',
  'admin.permission.assign',
  'admin.role.assign',
  'security.session.revoke',
  'integrations.service_account.create',
  'integrations.service_account.rotate',
] as const;

export type PermissionKey = (typeof PERMISSION_REGISTRY)[number];

export const DEFAULT_ORG_ROLE_TEMPLATES: Record<
  string,
  readonly PermissionKey[]
> = {
  ORG_ADMIN: PERMISSION_REGISTRY,
  SALES_MANAGER: [
    'crm.client.read',
    'crm.client.create',
    'sales.opportunity.create',
    'sales.opportunity.convert_to_project',
  ],
  PROJECT_MANAGER: [
    'projects.project.read',
    'projects.project.create',
    'flight.mission.read',
    'flight.mission.create',
    'flight.mission.complete',
    'deliverables.deliverable.create',
  ],
  IMAGE_MANAGER: [
    'image.media_batch.ingest',
    'image.sample.approve',
    'deliverables.deliverable.approve',
  ],
  FINANCE_MANAGER: ['finance.invoice.request', 'finance.invoice.approve'],
  FLIGHT_OPERATOR: [
    'flight.mission.read',
    'flight.mission.create',
    'flight.mission.complete',
  ],
};

export function parsePermissionKey(permissionKey: string) {
  const [moduleKey, resourceKey, actionKey] = permissionKey.split('.');
  return { moduleKey, resourceKey, actionKey };
}
