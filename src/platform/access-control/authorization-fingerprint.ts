import { sha256 } from 'src/common/utils/hash.util';
import { AccessPolicyDocument } from './access-policy.schema';
import { RoleAssignmentDocument } from './role-assignment.schema';
import { RoleDocument } from './role.schema';

export function buildAuthorizationFingerprint(input: {
  principalAuthorizationVersion: number;
  activeOrganizationId?: string;
  assignments: RoleAssignmentDocument[];
  roles: RoleDocument[];
  policies: AccessPolicyDocument[];
}): string {
  const now = Date.now();
  const roleVersionById = new Map(
    input.roles.map((role) => [String(role.id), role.version]),
  );
  const assignmentEntries = input.assignments
    .filter((assignment) => assignmentIsCurrentlyValid(assignment, now))
    .map((assignment) => {
      const roleId = String(assignment.roleId);
      return [
        assignment.organizationId,
        assignment.scopeType,
        assignment.scopeId,
        roleId,
        String(roleVersionById.get(roleId) ?? 'missing'),
      ].join(':');
    })
    .sort();
  const policyEntries = input.policies
    .map((policy) => `${policy.key}:${policy.version}`)
    .sort();

  return sha256(
    JSON.stringify({
      principalAuthorizationVersion: input.principalAuthorizationVersion,
      activeOrganizationId: input.activeOrganizationId ?? null,
      assignmentEntries,
      policyEntries,
    }),
  );
}

export function assignmentIsCurrentlyValid(
  assignment: RoleAssignmentDocument,
  now = Date.now(),
): boolean {
  if (assignment.validFrom && assignment.validFrom.getTime() > now) {
    return false;
  }
  if (assignment.validTo && assignment.validTo.getTime() <= now) {
    return false;
  }
  return true;
}
