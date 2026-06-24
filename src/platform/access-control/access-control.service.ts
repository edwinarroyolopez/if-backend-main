import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { RoleAssignmentStatus } from 'src/common/types/domain.types';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AccessPolicy, AccessPolicyDocument } from './access-policy.schema';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import {
  DEFAULT_BOOTSTRAP_ROLE_KEY,
  DEFAULT_ORG_ROLE_TEMPLATES,
  PERMISSION_REGISTRY,
  SUPERADMIN_ROLE_KEY,
  parsePermissionKey,
} from './permission-registry';
import {
  RoleAssignment,
  RoleAssignmentDocument,
} from './role-assignment.schema';
import {
  RolePermission,
  RolePermissionDocument,
} from './role-permission.schema';
import { Role, RoleDocument } from './role.schema';
import { ResourceScopeService } from './resource-scope.service';
import { ResourceScopeContext } from './resource-scope.types';

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: Model<PermissionDefinitionDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermissionDocument>,
    @InjectModel(RoleAssignment.name)
    private readonly roleAssignmentModel: Model<RoleAssignmentDocument>,
    @InjectModel(AccessPolicy.name)
    private readonly accessPolicyModel: Model<AccessPolicyDocument>,
    private readonly identityService: IdentityService,
    private readonly resourceScopeService: ResourceScopeService,
  ) {}

  async onModuleInit() {
    await Promise.all([
      this.seedPermissions(),
      this.accessPolicyModel.updateOne(
        { key: 'GLOBAL' },
        { $setOnInsert: { key: 'GLOBAL', version: 1 } },
        { upsert: true },
      ),
    ]);
  }

  async listPermissions() {
    const permissions = await this.permissionDefinitionModel
      .find({ status: 'ACTIVE' })
      .sort({ key: 1 });

    return permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      moduleKey: permission.moduleKey,
      resourceKey: permission.resourceKey,
      actionKey: permission.actionKey,
      description: permission.description,
    }));
  }

  async listUsers(organizationId: string, search?: string) {
    const assignments = await this.roleAssignmentModel.find({
      organizationId,
      principalType: 'USER',
      status: 'ACTIVE',
    });
    const users = await this.identityService.listUsersByIds(
      assignments.map((assignment) => assignment.principalId),
    );
    const normalizedSearch = search?.trim().toLowerCase();
    return users
      .filter((user) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          user.email.toLowerCase().includes(normalizedSearch) ||
          user.displayName.toLowerCase().includes(normalizedSearch)
        );
      })
      .map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
      }));
  }

  async listRoles(organizationId: string) {
    const roles = await this.roleModel.find({ organizationId }).sort({
      systemDefined: -1,
      name: 1,
    });
    const roleIds = roles.map((role) => role.id);
    const rolePermissions =
      roleIds.length > 0
        ? await this.rolePermissionModel.find({ roleId: { $in: roleIds } })
        : [];
    const permissionIds = rolePermissions.map(
      (rolePermission) => rolePermission.permissionId,
    );
    const permissions =
      permissionIds.length > 0
        ? await this.permissionDefinitionModel.find({
            _id: { $in: permissionIds },
          })
        : [];

    const permissionKeyById = new Map(
      permissions.map((permission) => [permission.id, permission.key]),
    );
    const permissionKeysByRoleId = new Map<string, string[]>();
    for (const rolePermission of rolePermissions) {
      const permissionKey = permissionKeyById.get(rolePermission.permissionId);
      if (!permissionKey) {
        continue;
      }

      const existing = permissionKeysByRoleId.get(rolePermission.roleId) ?? [];
      existing.push(permissionKey);
      permissionKeysByRoleId.set(rolePermission.roleId, existing);
    }

    return roles.map((role) => ({
      id: role.id,
      organizationId: role.organizationId,
      key: role.key,
      name: role.name,
      status: role.status,
      version: role.version,
      systemDefined: role.systemDefined,
      permissionKeys: (permissionKeysByRoleId.get(role.id) ?? []).sort(),
    }));
  }

  async listRoleAssignments(organizationId: string) {
    const assignments = await this.roleAssignmentModel
      .find({ organizationId })
      .sort({ createdAt: -1 });
    const roleIds = [
      ...new Set(assignments.map((assignment) => assignment.roleId)),
    ];
    const roles =
      roleIds.length > 0
        ? await this.roleModel.find({ _id: { $in: roleIds } })
        : [];
    const roleById = new Map(roles.map((role) => [role.id, role]));

    return assignments.map((assignment) => {
      const role = roleById.get(assignment.roleId);

      return {
        id: assignment.id,
        organizationId: assignment.organizationId,
        principalType: assignment.principalType,
        principalId: assignment.principalId,
        roleId: assignment.roleId,
        roleKey: role?.key,
        roleName: role?.name,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        status: assignment.status,
        validFrom: assignment.validFrom?.toISOString(),
        validTo: assignment.validTo?.toISOString(),
        assignedBy: assignment.assignedBy,
        createdAt: assignment.createdAt.toISOString(),
      };
    });
  }

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
      const activePermissionKeys = await this.listActivePermissionKeys(session);
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
    await this.rolePermissionModel.create(
      permissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
      { session, ordered: true },
    );
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
    await this.assertScopeBelongsToOrganization(
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

  async createDefaultRolesForOrganization(
    organizationId: string,
    actorUserId: string,
    session: ClientSession,
  ) {
    for (const [roleKey, permissionKeys] of Object.entries(
      DEFAULT_ORG_ROLE_TEMPLATES,
    )) {
      const role = await this.createRole(
        organizationId,
        {
          key: roleKey,
          name: roleKey.replaceAll('_', ' '),
          systemDefined: true,
        },
        session,
      );
      await this.assignPermissionsToRole(role.id, [...permissionKeys], session);
      if (roleKey === DEFAULT_BOOTSTRAP_ROLE_KEY) {
        await this.assignRoleToPrincipal(
          {
            organizationId,
            principalType: 'USER',
            principalId: actorUserId,
            roleId: role.id,
            scopeType: 'ORGANIZATION',
            scopeId: organizationId,
            assignedBy: actorUserId,
          },
          session,
        );
      }
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
    const existing = await this.findRoleByKey(organizationId, input.key, session);
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

  async resolveProjectAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[],
    session: ClientSession,
  ): Promise<string[]> {
    const uniqueRequestedRoleIds = [...new Set(requestedRoleIds)];
    const roles = await this.roleModel
      .find({ _id: { $in: uniqueRequestedRoleIds }, organizationId, status: 'ACTIVE' })
      .session(session);
    if (roles.length !== uniqueRequestedRoleIds.length) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project access roles must be active and belong to the same organization',
      );
    }

    const readableRoleIds = new Set(
      await this.listRoleIdsWithPermission(
        roles.map((role) => role.id),
        'projects.project.read',
        session,
      ),
    );
    if (readableRoleIds.size !== roles.length) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project access roles must include projects.project.read',
      );
    }

    const superadminRole = await this.reconcileSuperadminRole(
      organizationId,
      session,
    );

    return [...new Set([...uniqueRequestedRoleIds, superadminRole.id])];
  }

  async listProjectReadableRoleIds(
    organizationId: string,
    session: ClientSession,
  ): Promise<string[]> {
    const roles = await this.roleModel
      .find({ organizationId, status: 'ACTIVE' })
      .session(session);
    if (roles.length === 0) {
      return [];
    }

    const readableRoleIds = await this.listRoleIdsWithPermission(
      roles.map((role) => role.id),
      'projects.project.read',
      session,
    );
    const superadminRole = await this.reconcileSuperadminRole(
      organizationId,
      session,
    );

    return [...new Set([...readableRoleIds, superadminRole.id])];
  }

  async reconcileSuperadminRole(
    organizationId: string,
    session: ClientSession,
  ) {
    const role = await this.ensureSystemRole(
      organizationId,
      { key: SUPERADMIN_ROLE_KEY, name: 'Super Administrator' },
      session,
    );
    const activePermissionKeys = await this.listActivePermissionKeys(session);
    await this.assignPermissionsToRole(role.id, activePermissionKeys, session);
    const refreshedRole = await this.roleModel.findById(role.id).session(session);
    if (!refreshedRole) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Role was not found',
      );
    }

    return refreshedRole;
  }

  async touchGlobalAccessPolicy(session: ClientSession) {
    await this.accessPolicyModel.updateOne(
      { key: 'GLOBAL' },
      { $inc: { version: 1 } },
      { session },
    );
  }

  private async seedPermissions() {
    await Promise.all(
      PERMISSION_REGISTRY.map(async (permissionKey) => {
        const { moduleKey, resourceKey, actionKey } =
          parsePermissionKey(permissionKey);
        await this.permissionDefinitionModel.updateOne(
          { key: permissionKey },
          {
            $setOnInsert: {
              key: permissionKey,
              moduleKey,
              resourceKey,
              actionKey,
              status: 'ACTIVE',
            },
          },
          { upsert: true },
        );
      }),
    );
  }

  private async listActivePermissionKeys(session?: ClientSession) {
    const query = this.permissionDefinitionModel
      .find({ status: 'ACTIVE' })
      .sort({ key: 1 });
    const permissions = session ? await query.session(session) : await query;
    return permissions.map((permission) => permission.key);
  }

  private async listRoleIdsWithPermission(
    roleIds: string[],
    permissionKey: string,
    session: ClientSession,
  ) {
    const permissions = await this.permissionDefinitionModel
      .find({ key: permissionKey, status: 'ACTIVE' })
      .session(session);
    if (permissions.length === 0) {
      return [];
    }

    const activeRoles = await this.roleModel
      .find({ _id: { $in: roleIds }, status: 'ACTIVE' })
      .session(session);
    if (activeRoles.length === 0) {
      return [];
    }

    const rolePermissions = await this.rolePermissionModel
      .find({
        roleId: { $in: activeRoles.map((role) => role.id) },
        permissionId: { $in: permissions.map((permission) => permission.id) },
      })
      .session(session);
    return [...new Set(rolePermissions.map((rolePermission) => rolePermission.roleId))];
  }

  private async assertScopeBelongsToOrganization(
    organizationId: string,
    scopeType: ResourceScopeContext['candidateScopes'][number]['type'],
    scopeId: string,
    session: ClientSession,
  ) {
    if (scopeType === 'ORGANIZATION') {
      if (scopeId !== organizationId) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Role assignment organization scope is invalid',
        );
      }
      return;
    }

    if (scopeType === 'MODULE') {
      const modulePermission = await this.permissionDefinitionModel
        .findOne({ moduleKey: scopeId, status: 'ACTIVE' })
        .session(session);
      if (!modulePermission) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Role assignment module scope is invalid',
        );
      }
      return;
    }

    if (scopeType === 'PROJECT') {
      const context = await this.resourceScopeService.resolveResourceReference({
        resourceType: 'PROJECT',
        resourceId: scopeId,
        organizationId,
      });
      if (context.organizationId !== organizationId) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Project scope is outside the requested organization',
        );
      }

      return;
    }

    const context = await this.resourceScopeService.resolveResourceReference({
      resourceType: scopeType,
      resourceId: scopeId,
      organizationId,
    });
    if (context.organizationId !== organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Assignment scope is outside the requested organization',
      );
    }
  }
}
