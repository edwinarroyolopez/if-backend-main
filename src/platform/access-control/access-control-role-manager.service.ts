import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { RoleAssignmentStatus } from 'src/common/types/domain.types';
import { IdentityService } from 'src/platform/identity/identity.service';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import {
  DEFAULT_BOOTSTRAP_ROLE_KEY,
  DEFAULT_ORG_ROLE_TEMPLATES,
  PERMISSION_REGISTRY,
  SUPERADMIN_ROLE_KEY,
} from './permission-registry';
import { PermissionCatalogService } from './permission-catalog.service';
import {
  RoleAssignment,
  RoleAssignmentDocument,
} from './role-assignment.schema';
import {
  RolePermission,
  RolePermissionDocument,
} from './role-permission.schema';
import { Role, RoleDocument } from './role.schema';
import { ResourceScopeContext } from './resource-scope.types';
import { AccessControlScopeValidatorService } from './access-control-scope-validator.service';

@Injectable()
export class AccessControlRoleManagerService {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: Model<PermissionDefinitionDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermissionDocument>,
    @InjectModel(RoleAssignment.name)
    private readonly roleAssignmentModel: Model<RoleAssignmentDocument>,
    private readonly identityService: IdentityService,
    private readonly permissionCatalogService: PermissionCatalogService,
    private readonly scopeValidator: AccessControlScopeValidatorService,
  ) {}

  async createRole(
    organizationId: string,
    input: { key: string; name: string; systemDefined?: boolean },
    session: ClientSession,
  ) {
    const key = input.key.trim().toUpperCase();
    if (key === SUPERADMIN_ROLE_KEY && !input.systemDefined) {
      throw new AppException(
        409,
        REASON_CODES.VALIDATION_FAILED,
        'Role key is reserved',
      );
    }

    const [role] = await this.roleModel.create(
      [
        {
          organizationId,
          key,
          name: input.name.trim(),
          status: 'ACTIVE',
          version: 1,
          systemDefined: input.systemDefined ?? false,
        },
      ],
      { session },
    );

    return role;
  }

  async assignPermissionsToRole(
    roleId: string,
    permissionKeys: string[],
    session: ClientSession,
  ) {
    const uniquePermissionKeys = [...new Set(permissionKeys)];
    const role = await this.roleModel.findById(roleId).session(session);
    if (!role) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Role was not found',
      );
    }

    const permissions = await this.permissionDefinitionModel
      .find({ key: { $in: uniquePermissionKeys }, status: 'ACTIVE' })
      .session(session);
    if (permissions.length !== uniquePermissionKeys.length) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Permission definition was not found',
      );
    }

    if (role.key === SUPERADMIN_ROLE_KEY) {
      const activePermissionKeys =
        await this.permissionCatalogService.listActivePermissionKeys(session);
      if (
        activePermissionKeys.length !== uniquePermissionKeys.length ||
        activePermissionKeys.some(
          (permissionKey) => !uniquePermissionKeys.includes(permissionKey),
        )
      ) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'SUPERADMIN must retain complete permission coverage',
        );
      }
    }

    await this.rolePermissionModel.deleteMany({ roleId }).session(session);
    if (permissions.length > 0) {
      await this.rolePermissionModel.insertMany(
        permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
        { session, ordered: true },
      );
    }
    role.version += 1;
    await role.save({ session });

    return role;
  }

  async assignRoleToPrincipal(
    input: {
      organizationId: string;
      principalType: 'USER' | 'SERVICE_ACCOUNT';
      principalId: string;
      roleId: string;
      scopeType: ResourceScopeContext['candidateScopes'][number]['type'];
      scopeId: string;
      assignedBy: string;
    },
    session: ClientSession,
  ) {
    const role = await this.roleModel.findById(input.roleId).session(session);
    if (!role || role.organizationId !== input.organizationId) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Role was not found',
      );
    }
    if (role.status !== 'ACTIVE') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Role is not active',
      );
    }
    if (input.principalType === 'USER') {
      const user = await this.identityService.findUserById(input.principalId);
      if (!user) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'User was not found',
        );
      }
    }
    await this.scopeValidator.assertScopeBelongsToOrganization(
      input.organizationId,
      input.scopeType,
      input.scopeId,
      session,
    );

    const [assignment] = await this.roleAssignmentModel.create(
      [
        {
          organizationId: input.organizationId,
          principalType: input.principalType,
          principalId: input.principalId,
          roleId: input.roleId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          status: 'ACTIVE' satisfies RoleAssignmentStatus,
          assignedBy: input.assignedBy,
        },
      ],
      { session },
    );

    if (input.principalType === 'USER') {
      await this.identityService.bumpAuthorizationVersion(
        input.principalId,
        session,
      );
    }

    return assignment;
  }

  async reconcileSystemDefinedRolePermissions() {
    const permissions = await this.permissionDefinitionModel.find({
      status: 'ACTIVE',
    });
    const permissionByKey = new Map(
      permissions.map((permission) => [permission.key, permission]),
    );
    const activePermissionKeys = permissions.map(
      (permission) => permission.key,
    );
    const expectedPermissionKeysByRoleKey = new Map<string, readonly string[]>([
      ...Object.entries(DEFAULT_ORG_ROLE_TEMPLATES),
      [SUPERADMIN_ROLE_KEY, activePermissionKeys],
    ]);
    const roles = await this.roleModel.find({
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
      if (
        expectedPermissionIds.length !== uniqueExpectedPermissionKeys.length
      ) {
        continue;
      }

      const existingPermissions = await this.rolePermissionModel.find({
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

      await this.rolePermissionModel.deleteMany({ roleId: role.id });
      if (expectedPermissionIds.length > 0) {
        await this.rolePermissionModel.insertMany(
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

  async createDefaultRolesForOrganization(
    organizationId: string,
    actorUserId: string,
    session: ClientSession,
  ) {
    const roleTemplates = Object.entries(DEFAULT_ORG_ROLE_TEMPLATES);
    const permissions = await this.permissionDefinitionModel
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

    const roles = await this.roleModel.insertMany(
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
    const rolePermissions = roleTemplates.flatMap(
      ([roleKey, permissionKeys]) => {
        const role = roleByKey.get(roleKey);
        if (!role) return [];

        return [...new Set(permissionKeys)].map((permissionKey) => ({
          roleId: role.id,
          permissionId: permissionByKey.get(permissionKey)!.id,
        }));
      },
    );
    await this.rolePermissionModel.insertMany(rolePermissions, {
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

    await this.roleAssignmentModel.create(
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
    const user = await this.identityService.bumpAuthorizationVersion(
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

  async findRoleByKey(
    organizationId: string,
    roleKey: string,
    session?: ClientSession,
  ) {
    const query = this.roleModel.findOne({
      organizationId,
      key: roleKey.trim().toUpperCase(),
    });
    return session ? query.session(session) : query;
  }

  async ensureSystemRole(
    organizationId: string,
    input: { key: string; name: string },
    session: ClientSession,
  ) {
    const existing = await this.findRoleByKey(
      organizationId,
      input.key,
      session,
    );
    if (existing) {
      if (!existing.systemDefined || existing.status !== 'ACTIVE') {
        existing.systemDefined = true;
        existing.status = 'ACTIVE';
        existing.name = input.name;
        existing.version += 1;
        await existing.save({ session });
      }
      return existing;
    }

    return this.createRole(
      organizationId,
      { key: input.key, name: input.name, systemDefined: true },
      session,
    );
  }
}
