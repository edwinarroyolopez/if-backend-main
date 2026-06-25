import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IdentityService } from 'src/platform/identity/identity.service';
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

@Injectable()
export class AccessControlReadersService {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: Model<PermissionDefinitionDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermissionDocument>,
    @InjectModel(RoleAssignment.name)
    private readonly roleAssignmentModel: Model<RoleAssignmentDocument>,
    private readonly identityService: IdentityService,
  ) {}

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
        if (!normalizedSearch) return true;

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
      if (!permissionKey) continue;

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
}
