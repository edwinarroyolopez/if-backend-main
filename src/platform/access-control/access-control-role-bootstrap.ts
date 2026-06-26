import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { RoleAssignmentStatus } from 'src/common/types/domain.types';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { IdentityService } from 'src/platform/identity/identity.service';
import { PermissionDefinitionDocument } from './permission-definition.schema';
import {
  DEFAULT_BOOTSTRAP_ROLE_KEY,
  DEFAULT_ORG_ROLE_TEMPLATES,
  PERMISSION_REGISTRY,
  SUPERADMIN_ROLE_KEY,
} from './permission-registry';
import { RoleAssignmentDocument } from './role-assignment.schema';
import { RolePermissionDocument } from './role-permission.schema';
import { RoleDocument } from './role.schema';

type RoleBootstrapDeps = {
  permissionDefinitionModel: HydratedModel<PermissionDefinitionDocument>;
  roleModel: HydratedModel<RoleDocument>;
  rolePermissionModel: HydratedModel<RolePermissionDocument>;
  roleAssignmentModel: HydratedModel<RoleAssignmentDocument>;
  identityService: IdentityService;
};

export async function reconcileSystemDefinedRolePermissions(
  deps: RoleBootstrapDeps,
) {
  const permissions = await deps.permissionDefinitionModel.find({
    status: 'ACTIVE',
  });
  const permissionByKey = new Map(
    permissions.map((permission) => [permission.key, permission]),
  );
  const activePermissionKeys = permissions.map((permission) => permission.key);
  const expectedPermissionKeysByRoleKey = new Map<string, readonly string[]>([
    ...Object.entries(DEFAULT_ORG_ROLE_TEMPLATES),
    [SUPERADMIN_ROLE_KEY, activePermissionKeys],
  ]);
  const roles = await deps.roleModel.find({
    key: { $in: [...expectedPermissionKeysByRoleKey.keys()] },
    status: 'ACTIVE',
    systemDefined: true,
  });

  for (const role of roles) {
    const expectedPermissionKeys = expectedPermissionKeysByRoleKey.get(
      role.key,
    );
    if (!expectedPermissionKeys) continue;

    const uniqueExpectedPermissionKeys = [...new Set(expectedPermissionKeys)];
    const expectedPermissionIds = uniqueExpectedPermissionKeys
      .map((permissionKey) => permissionByKey.get(permissionKey)?.id)
      .filter(
        (permissionId): permissionId is string =>
          typeof permissionId === 'string',
      );
    if (expectedPermissionIds.length !== uniqueExpectedPermissionKeys.length) {
      continue;
    }

    const existingPermissions = await deps.rolePermissionModel.find({
      roleId: role.id,
    });
    const existingPermissionIds = existingPermissions.map(
      (permission) => permission.permissionId,
    );
    const alreadySynced =
      existingPermissionIds.length === expectedPermissionIds.length &&
      expectedPermissionIds.every((permissionId) =>
        existingPermissionIds.includes(permissionId),
      );
    if (alreadySynced) continue;

    await deps.rolePermissionModel.deleteMany({ roleId: role.id });
    if (expectedPermissionIds.length > 0) {
      await deps.rolePermissionModel.insertMany(
        expectedPermissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        { ordered: true },
      );
    }
    role.version += 1;
    await role.save();
  }
}

export async function createDefaultRolesForOrganization(
  deps: RoleBootstrapDeps,
  organizationId: string,
  actorUserId: string,
  session: ClientSession,
) {
  const roleTemplates = Object.entries(DEFAULT_ORG_ROLE_TEMPLATES);
  const permissions = await deps.permissionDefinitionModel
    .find({ key: { $in: [...PERMISSION_REGISTRY] }, status: 'ACTIVE' })
    .session(session);
  const permissionByKey = new Map(
    permissions.map((permission) => [permission.key, permission]),
  );
  const missingPermission = PERMISSION_REGISTRY.find(
    (permissionKey) => !permissionByKey.has(permissionKey),
  );
  if (missingPermission) {
    throw new AppException(
      404,
      REASON_CODES.RESOURCE_NOT_FOUND,
      'Permission definition was not found',
    );
  }

  const roles = await deps.roleModel.insertMany(
    roleTemplates.map(([roleKey]) => ({
      organizationId,
      key: roleKey,
      name: roleKey.replaceAll('_', ' '),
      status: 'ACTIVE',
      version: 2,
      systemDefined: true,
    })),
    { session, ordered: true },
  );
  const roleByKey = new Map(roles.map((role) => [role.key, role]));
  const rolePermissions = roleTemplates.flatMap(([roleKey, permissionKeys]) => {
    const role = roleByKey.get(roleKey);
    if (!role) return [];

    return [...new Set(permissionKeys)].map((permissionKey) => ({
      roleId: role.id,
      permissionId: permissionByKey.get(permissionKey)!.id,
    }));
  });
  await deps.rolePermissionModel.insertMany(rolePermissions, {
    session,
    ordered: true,
  });

  const bootstrapRole = roleByKey.get(DEFAULT_BOOTSTRAP_ROLE_KEY);
  if (!bootstrapRole) {
    throw new AppException(
      404,
      REASON_CODES.RESOURCE_NOT_FOUND,
      'Role was not found',
    );
  }

  await deps.roleAssignmentModel.create(
    [
      {
        organizationId,
        principalType: 'USER',
        principalId: actorUserId,
        roleId: bootstrapRole.id,
        scopeType: 'ORGANIZATION',
        scopeId: organizationId,
        status: 'ACTIVE' satisfies RoleAssignmentStatus,
        assignedBy: actorUserId,
      },
    ],
    { session },
  );
  const user = await deps.identityService.bumpAuthorizationVersion(
    actorUserId,
    session,
  );
  if (!user) {
    throw new AppException(
      404,
      REASON_CODES.RESOURCE_NOT_FOUND,
      'User was not found',
    );
  }
}
