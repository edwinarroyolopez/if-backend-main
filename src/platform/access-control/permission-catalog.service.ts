import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import { PERMISSION_REGISTRY, parsePermissionKey } from './permission-registry';
import {
  RolePermission,
  RolePermissionDocument,
} from './role-permission.schema';
import { Role, RoleDocument } from './role.schema';

@Injectable()
export class PermissionCatalogService {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: Model<PermissionDefinitionDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermissionDocument>,
  ) {}

  async seedPermissions() {
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

  async listActivePermissionKeys(session?: ClientSession) {
    const query = this.permissionDefinitionModel
      .find({ status: 'ACTIVE' })
      .sort({ key: 1 });
    const permissions = session ? await query.session(session) : await query;
    return permissions.map((permission) => permission.key);
  }

  async roleHasPermissionCoverage(
    roleId: string,
    permissionKeys: string[],
    session: ClientSession,
  ) {
    if (permissionKeys.length === 0) {
      return true;
    }

    const permissions = await this.permissionDefinitionModel
      .find({ key: { $in: permissionKeys }, status: 'ACTIVE' })
      .session(session);
    if (permissions.length !== permissionKeys.length) {
      return false;
    }

    const permissionCount = await this.rolePermissionModel
      .countDocuments({
        roleId,
        permissionId: { $in: permissions.map((permission) => permission.id) },
      })
      .session(session);
    return permissionCount === permissions.length;
  }

  async listRoleIdsWithPermission(
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
    return [
      ...new Set(
        rolePermissions.map((rolePermission) => rolePermission.roleId),
      ),
    ];
  }
}
