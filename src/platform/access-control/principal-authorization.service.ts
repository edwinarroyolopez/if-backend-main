import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { sha256 } from 'src/common/utils/hash.util';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AccessPolicy, AccessPolicyDocument } from './access-policy.schema';
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
import { ResourceScopeContext } from './resource-scope.types';

export type AuthorizationContextSnapshot = {
  authorizationVersion: number;
  authorizationFingerprint: string;
};

@Injectable()
export class PrincipalAuthorizationService {
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

  async listEffectivePermissionKeysForNavigation(
    principal: AuthenticatedPrincipal,
  ): Promise<string[]> {
    if (!principal.activeOrganizationId) {
      return [];
    }

    const assignments = await this.roleAssignmentModel.find({
      organizationId: principal.activeOrganizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
      status: 'ACTIVE',
    });
    const now = Date.now();
    const navigationAssignments = assignments.filter((assignment) => {
      if (assignment.validFrom && assignment.validFrom.getTime() > now) {
        return false;
      }

      if (assignment.validTo && assignment.validTo.getTime() <= now) {
        return false;
      }

      return (
        (assignment.scopeType === 'ORGANIZATION' &&
          assignment.scopeId === principal.activeOrganizationId) ||
        assignment.scopeType === 'MODULE'
      );
    });
    if (navigationAssignments.length === 0) {
      return [];
    }

    const roleIds = [
      ...new Set(navigationAssignments.map((assignment) => assignment.roleId)),
    ];
    const rolePermissions = await this.rolePermissionModel.find({
      roleId: { $in: roleIds },
    });
    if (rolePermissions.length === 0) {
      return [];
    }

    const permissionIds = rolePermissions.map(
      (rolePermission) => rolePermission.permissionId,
    );
    const permissions = await this.permissionDefinitionModel
      .find({ _id: { $in: permissionIds }, status: 'ACTIVE' })
      .sort({ key: 1 });

    return permissions.map((permission) => permission.key);
  }

  async getUserAuthorizationContext(
    userId: string,
    activeOrganizationId?: string,
    currentAuthorizationVersion?: number,
  ): Promise<AuthorizationContextSnapshot> {
    const principalAuthorizationVersion =
      currentAuthorizationVersion ??
      (await this.identityService.findUserById(userId))?.authorizationVersion;
    if (principalAuthorizationVersion === undefined) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'User was not found',
      );
    }

    const { assignments, policies, roles } =
      await this.loadAuthorizationGraphForPrincipal({
        principalType: 'USER',
        principalId: userId,
        activeOrganizationId,
      });

    return {
      authorizationVersion: principalAuthorizationVersion,
      authorizationFingerprint: buildAuthorizationFingerprint({
        principalAuthorizationVersion,
        activeOrganizationId,
        assignments,
        roles,
        policies,
      }),
    };
  }

  async getServiceAccountAuthorizationContext(input: {
    serviceAccountId: string;
    authorizationVersion: number;
    activeOrganizationId: string;
  }): Promise<AuthorizationContextSnapshot> {
    const { assignments, policies, roles } =
      await this.loadAuthorizationGraphForPrincipal({
        principalType: 'SERVICE_ACCOUNT',
        principalId: input.serviceAccountId,
        activeOrganizationId: input.activeOrganizationId,
      });

    return {
      authorizationVersion: input.authorizationVersion,
      authorizationFingerprint: buildAuthorizationFingerprint({
        principalAuthorizationVersion: input.authorizationVersion,
        activeOrganizationId: input.activeOrganizationId,
        assignments,
        roles,
        policies,
      }),
    };
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

  private async loadAuthorizationGraphForPrincipal(input: {
    principalType: 'USER' | 'SERVICE_ACCOUNT';
    principalId: string;
    activeOrganizationId?: string;
  }) {
    const assignmentQuery: {
      principalType: 'USER' | 'SERVICE_ACCOUNT';
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
}

function buildAuthorizationFingerprint(input: {
  principalAuthorizationVersion: number;
  activeOrganizationId?: string;
  assignments: RoleAssignmentDocument[];
  roles: RoleDocument[];
  policies: AccessPolicyDocument[];
}): string {
  const now = Date.now();
  const roleVersionById = new Map(
    input.roles.map((role) => [String(role.id), role.version]),
  );
  const assignmentEntries = input.assignments
    .filter((assignment) => {
      if (assignment.validFrom && assignment.validFrom.getTime() > now) {
        return false;
      }

      if (assignment.validTo && assignment.validTo.getTime() <= now) {
        return false;
      }

      return true;
    })
    .map((assignment) => {
      const roleId = String(assignment.roleId);
      return [
        assignment.organizationId,
        assignment.scopeType,
        assignment.scopeId,
        roleId,
        String(roleVersionById.get(roleId) ?? 'missing'),
      ].join(':');
    })
    .sort();
  const policyEntries = input.policies
    .map((policy) => `${policy.key}:${policy.version}`)
    .sort();

  return sha256(
    JSON.stringify({
      principalAuthorizationVersion: input.principalAuthorizationVersion,
      activeOrganizationId: input.activeOrganizationId ?? null,
      assignmentEntries,
      policyEntries,
    }),
  );
}
