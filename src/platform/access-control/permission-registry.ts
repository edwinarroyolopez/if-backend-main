export const PERMISSION_REGISTRY = [
  'crm.client.read',
  'crm.client.create',
  'sales.opportunity.read',
  'sales.opportunity.create',
  'sales.opportunity.convert_to_project',
  'projects.project.read',
  'projects.project.create',
  'projects.project.assign_roles',
  'flight.mission.read',
  'flight.mission.create',
  'flight.mission.complete',
  'image.media_batch.read',
  'image.media_batch.ingest',
  'image.sample.read',
  'image.sample.create',
  'image.sample.approve',
  'deliverables.deliverable.read',
  'deliverables.deliverable.create',
  'deliverables.deliverable.approve',
  'finance.invoice.read',
  'finance.invoice.request',
  'finance.invoice.approve',
  'admin.permission.read',
  'admin.role.read',
  'admin.role.create',
  'admin.permission.assign',
  'admin.role_assignment.read',
  'admin.role.assign',
  'admin.user.read',
  'security.session.revoke',
  'integrations.service_account.create',
  'integrations.service_account.rotate',
] as const;

export type PermissionKey = (typeof PERMISSION_REGISTRY)[number];

export const SUPERADMIN_ROLE_KEY = 'SUPERADMIN';

export const DEFAULT_BOOTSTRAP_ROLE_KEY = 'ORG_ADMIN';

export const DEFAULT_ORG_ROLE_TEMPLATES: Record<
  string,
  readonly PermissionKey[]
> = {
  [DEFAULT_BOOTSTRAP_ROLE_KEY]: PERMISSION_REGISTRY,
  SALES_MANAGER: [
    'crm.client.read',
    'crm.client.create',
    'sales.opportunity.read',
    'sales.opportunity.create',
    'sales.opportunity.convert_to_project',
  ],
  PROJECT_MANAGER: [
    'projects.project.read',
    'projects.project.create',
    'flight.mission.read',
    'flight.mission.create',
    'flight.mission.complete',
    'deliverables.deliverable.read',
    'deliverables.deliverable.create',
  ],
  IMAGE_MANAGER: [
    'image.media_batch.read',
    'image.media_batch.ingest',
    'image.sample.read',
    'image.sample.create',
    'image.sample.approve',
    'deliverables.deliverable.read',
    'deliverables.deliverable.approve',
  ],
  FINANCE_MANAGER: [
    'finance.invoice.read',
    'finance.invoice.request',
    'finance.invoice.approve',
  ],
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
