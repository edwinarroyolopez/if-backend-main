import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AccessPolicy, AccessPolicyDocument } from './access-policy.schema';
import { AccessControlProjectAccessService } from './access-control-project-access.service';
import { AccessControlReadersService } from './access-control-readers.service';
import { AccessControlRoleManagerService } from './access-control-role-manager.service';
import { PermissionCatalogService } from './permission-catalog.service';
import { ResourceScopeContext } from './resource-scope.types';

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(
    @InjectModel(AccessPolicy.name)
    private readonly accessPolicyModel: Model<AccessPolicyDocument>,
    private readonly readers: AccessControlReadersService,
    private readonly roleManager: AccessControlRoleManagerService,
    private readonly projectAccess: AccessControlProjectAccessService,
    private readonly permissionCatalog: PermissionCatalogService,
  ) {}

  async onModuleInit() {
    await Promise.all([
      this.permissionCatalog.seedPermissions(),
      this.accessPolicyModel.updateOne(
        { key: 'GLOBAL' },
        { $setOnInsert: { key: 'GLOBAL', version: 1 } },
        { upsert: true },
      ),
    ]);
  }

  async listPermissions() {
    return this.readers.listPermissions();
  }

  async listUsers(organizationId: string, search?: string) {
    return this.readers.listUsers(organizationId, search);
  }

  async listRoles(organizationId: string) {
    return this.readers.listRoles(organizationId);
  }

  async listRoleAssignments(organizationId: string) {
    return this.readers.listRoleAssignments(organizationId);
  }

  async createRole(
    organizationId: string,
    input: { key: string; name: string; systemDefined?: boolean },
    session: ClientSession,
  ) {
    return this.roleManager.createRole(organizationId, input, session);
  }

  async assignPermissionsToRole(
    roleId: string,
    permissionKeys: string[],
    session: ClientSession,
  ) {
    return this.roleManager.assignPermissionsToRole(
      roleId,
      permissionKeys,
      session,
    );
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
    return this.roleManager.assignRoleToPrincipal(input, session);
  }

  async createDefaultRolesForOrganization(
    organizationId: string,
    actorUserId: string,
    session: ClientSession,
  ) {
    return this.roleManager.createDefaultRolesForOrganization(
      organizationId,
      actorUserId,
      session,
    );
  }

  async findRoleByKey(
    organizationId: string,
    roleKey: string,
    session?: ClientSession,
  ) {
    return this.roleManager.findRoleByKey(organizationId, roleKey, session);
  }

  async ensureSystemRole(
    organizationId: string,
    input: { key: string; name: string },
    session: ClientSession,
  ) {
    return this.roleManager.ensureSystemRole(organizationId, input, session);
  }

  async resolveProjectAccessRoleIds(
    organizationId: string,
    requestedRoleIds: string[],
    session: ClientSession,
  ): Promise<string[]> {
    return this.projectAccess.resolveProjectAccessRoleIds(
      organizationId,
      requestedRoleIds,
      session,
    );
  }

  async listProjectReadableRoleIds(
    organizationId: string,
    session: ClientSession,
  ): Promise<string[]> {
    return this.projectAccess.listProjectReadableRoleIds(
      organizationId,
      session,
    );
  }

  async reconcileSuperadminRole(
    organizationId: string,
    session: ClientSession,
  ) {
    return this.projectAccess.reconcileSuperadminRole(organizationId, session);
  }

  async touchGlobalAccessPolicy(session: ClientSession) {
    await this.accessPolicyModel.updateOne(
      { key: 'GLOBAL' },
      { $inc: { version: 1 } },
      { session },
    );
  }
}
