import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { AccessPolicy, AccessPolicyDocument } from './access-policy.schema';
import { assignmentIsCurrentlyValid } from './authorization-fingerprint';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import {
  RoleAssignment,
  RoleAssignmentDocument,
} from './role-assignment.schema';
import {
  RolePermission,
  RolePermissionDocument,
} from './role-permission.schema';
import { Role, RoleDocument } from './role.schema';

type PrincipalType = 'USER' | 'SERVICE_ACCOUNT';

@Injectable()
export class PrincipalAuthorizationStore {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: HydratedModel<PermissionDefinitionDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: HydratedModel<RoleDocument>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: HydratedModel<RolePermissionDocument>,
    @InjectModel(RoleAssignment.name)
    private readonly roleAssignmentModel: HydratedModel<RoleAssignmentDocument>,
    @InjectModel(AccessPolicy.name)
    private readonly accessPolicyModel: HydratedModel<AccessPolicyDocument>,
  ) {}

  async loadAuthorizationGraphForPrincipal(input: {
    principalType: PrincipalType;
    principalId: string;
    activeOrganizationId?: string;
  }) {
    const assignmentQuery: {
      principalType: PrincipalType;
      principalId: string;
      status: 'ACTIVE';
      organizationId?: string;
    } = {
      principalType: input.principalType,
      principalId: input.principalId,
      status: 'ACTIVE',
    };
    if (input.activeOrganizationId) {
      assignmentQuery.organizationId = input.activeOrganizationId;
    }

    const [assignments, policies] = await Promise.all([
      this.roleAssignmentModel.find(assignmentQuery),
      this.accessPolicyModel.find({}).sort({ key: 1 }),
    ]);
    const roleIds = [
      ...new Set(assignments.map((assignment) => assignment.roleId)),
    ];
    const roles =
      roleIds.length > 0
        ? await this.roleModel.find({ _id: { $in: roleIds } })
        : [];

    return { assignments, policies, roles };
  }

  async listValidAssignments(query: {
    organizationId?: string;
    principalType: PrincipalType;
    principalId: string;
  }): Promise<RoleAssignmentDocument[]> {
    const assignments = await this.roleAssignmentModel.find({
      ...query,
      status: 'ACTIVE',
    });
    const now = Date.now();
    return assignments.filter((assignment) =>
      assignmentIsCurrentlyValid(assignment, now),
    );
  }

  async listRoleIdsWithPermission(
    roleIds: string[],
    permissionKey: string,
  ): Promise<string[]> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return [];
    }

    const [roles, permissions] = await Promise.all([
      this.roleModel.find({ _id: { $in: uniqueRoleIds }, status: 'ACTIVE' }),
      this.permissionDefinitionModel.find({
        key: permissionKey,
        status: 'ACTIVE',
      }),
    ]);
    if (roles.length === 0 || permissions.length === 0) {
      return [];
    }

    const activeRoleIds = new Set(roles.map((role) => role.id));
    const permissionIds = permissions.map((permission) => permission.id);
    const rolePermissions = await this.rolePermissionModel.find({
      roleId: { $in: [...activeRoleIds] },
      permissionId: { $in: permissionIds },
    });

    return [
      ...new Set(
        rolePermissions.map((rolePermission) => rolePermission.roleId),
      ),
    ];
  }

  async listPermissionKeysForRoleIds(roleIds: string[]): Promise<string[]> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return [];
    }

    const roles = await this.roleModel.find({
      _id: { $in: uniqueRoleIds },
      status: 'ACTIVE',
    });
    if (roles.length === 0) {
      return [];
    }

    const rolePermissions = await this.rolePermissionModel.find({
      roleId: { $in: roles.map((role) => role.id) },
    });
    if (rolePermissions.length === 0) {
      return [];
    }

    const permissions = await this.permissionDefinitionModel
      .find({
        _id: {
          $in: rolePermissions.map(
            (rolePermission) => rolePermission.permissionId,
          ),
        },
        status: 'ACTIVE',
      })
      .sort({ key: 1 });
    return [...new Set(permissions.map((permission) => permission.key))];
  }
}
