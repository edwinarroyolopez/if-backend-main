import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { RoleAssignmentStatus } from 'src/common/types/domain.types';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AccessPolicy, AccessPolicyDocument } from './access-policy.schema';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import {
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
      { session },
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
      if (roleKey === 'ORG_ADMIN') {
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

  async getEffectiveAuthorizationVersionForUser(
    userId: string,
  ): Promise<number> {
    const [user, assignments, globalPolicy] = await Promise.all([
      this.identityService.findUserById(userId),
      this.roleAssignmentModel.find({
        principalType: 'USER',
        principalId: userId,
        status: 'ACTIVE',
      }),
      this.accessPolicyModel.findOne({ key: 'GLOBAL' }),
    ]);

    if (!user) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'User was not found',
      );
    }

    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles =
      roleIds.length > 0
        ? await this.roleModel.find({ _id: { $in: roleIds } })
        : [];
    return Math.max(
      user.authorizationVersion,
      globalPolicy?.version ?? 1,
      ...roles.map((role) => role.version),
    );
  }

  async getEffectiveAuthorizationVersionForServiceAccount(
    serviceAccountId: string,
    currentAuthorizationVersion: number,
  ): Promise<number> {
    const [assignments, globalPolicy] = await Promise.all([
      this.roleAssignmentModel.find({
        principalType: 'SERVICE_ACCOUNT',
        principalId: serviceAccountId,
        status: 'ACTIVE',
      }),
      this.accessPolicyModel.findOne({ key: 'GLOBAL' }),
    ]);
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles =
      roleIds.length > 0
        ? await this.roleModel.find({ _id: { $in: roleIds } })
        : [];
    return Math.max(
      currentAuthorizationVersion,
      globalPolicy?.version ?? 1,
      ...roles.map((role) => role.version),
    );
  }

  async can(
    principal: AuthenticatedPrincipal,
    permissionKey: string,
    scopeContext: ResourceScopeContext,
  ): Promise<boolean> {
    if (
      !principal.activeOrganizationId ||
      principal.activeOrganizationId !== scopeContext.organizationId
    ) {
      return false;
    }

    const assignments = await this.roleAssignmentModel.find({
      organizationId: scopeContext.organizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
      status: 'ACTIVE',
    });
    if (assignments.length === 0) {
      return false;
    }

    const now = Date.now();
    const activeAssignments = assignments.filter((assignment) => {
      if (assignment.validFrom && assignment.validFrom.getTime() > now) {
        return false;
      }
      if (assignment.validTo && assignment.validTo.getTime() <= now) {
        return false;
      }
      return scopeContext.candidateScopes.some(
        (scope) =>
          scope.type === assignment.scopeType &&
          scope.id === assignment.scopeId,
      );
    });
    if (activeAssignments.length === 0) {
      return false;
    }

    const roleIds = [
      ...new Set(activeAssignments.map((assignment) => assignment.roleId)),
    ];
    const [roles, rolePermissions] = await Promise.all([
      this.roleModel.find({ _id: { $in: roleIds }, status: 'ACTIVE' }),
      this.rolePermissionModel.find({ roleId: { $in: roleIds } }),
    ]);
    if (roles.length === 0 || rolePermissions.length === 0) {
      return false;
    }

    const permissionIds = rolePermissions.map(
      (rolePermission) => rolePermission.permissionId,
    );
    const permissions = await this.permissionDefinitionModel.find({
      _id: { $in: permissionIds },
      key: permissionKey,
    });
    return permissions.length > 0;
  }

  async resolvePrimaryOrganizationForUser(
    userId: string,
  ): Promise<string | undefined> {
    const assignment = await this.roleAssignmentModel.findOne({
      principalType: 'USER',
      principalId: userId,
      status: 'ACTIVE',
    });
    return assignment?.organizationId;
  }

  async listOrganizationsForUser(userId: string): Promise<string[]> {
    const assignments = await this.roleAssignmentModel.find({
      principalType: 'USER',
      principalId: userId,
      status: 'ACTIVE',
    });
    return [
      ...new Set(assignments.map((assignment) => assignment.organizationId)),
    ];
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
