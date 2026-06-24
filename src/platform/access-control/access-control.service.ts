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
    const [role] = await this.roleModel.create(
      [
        {
          organizationId,
          key: input.key,
          name: input.name,
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
    const role = await this.roleModel.findById(roleId).session(session);
    if (!role) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Role was not found',
      );
    }

    const permissions = await this.permissionDefinitionModel
      .find({ key: { $in: permissionKeys }, status: 'ACTIVE' })
      .session(session);
    if (permissions.length !== permissionKeys.length) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Permission definition was not found',
      );
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
}
