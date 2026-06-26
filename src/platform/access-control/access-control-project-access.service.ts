import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { AccessControlRoleManagerService } from './access-control-role-manager.service';
import { PermissionCatalogService } from './permission-catalog.service';
import { SUPERADMIN_ROLE_KEY } from './permission-registry';
import { Role, RoleDocument } from './role.schema';

@Injectable()
export class AccessControlProjectAccessService {
  constructor(
    @InjectModel(Role.name)
    private readonly roleModel: HydratedModel<RoleDocument>,
    private readonly roleManager: AccessControlRoleManagerService,
    private readonly permissionCatalogService: PermissionCatalogService,
  ) {}

  async resolveProjectAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[],
    session: ClientSession,
  ): Promise<string[]> {
    const uniqueRequestedRoleIds = [...new Set(requestedRoleIds)];
    const roles = await this.roleModel
      .find({
        _id: { $in: uniqueRequestedRoleIds },
        organizationId,
        status: 'ACTIVE',
      })
      .session(session);
    if (roles.length !== uniqueRequestedRoleIds.length) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project access roles must be active and belong to the same organization',
      );
    }

    const readableRoleIds = new Set(
      await this.permissionCatalogService.listRoleIdsWithPermission(
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

    const readableRoleIds =
      await this.permissionCatalogService.listRoleIdsWithPermission(
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
    const role = await this.roleManager.ensureSystemRole(
      organizationId,
      { key: SUPERADMIN_ROLE_KEY, name: 'Super Administrator' },
      session,
    );
    const activePermissionKeys =
      await this.permissionCatalogService.listActivePermissionKeys(session);
    if (
      await this.permissionCatalogService.roleHasPermissionCoverage(
        role.id,
        activePermissionKeys,
        session,
      )
    ) {
      return role;
    }

    await this.roleManager.assignPermissionsToRole(
      organizationId,
      role.id,
      activePermissionKeys,
      session,
    );
    const refreshedRole = await this.roleModel
      .findById(role.id)
      .session(session);
    if (!refreshedRole) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Role was not found',
      );
    }

    return refreshedRole;
  }
}
