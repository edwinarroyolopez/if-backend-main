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

type ValidAssignment = RoleAssignmentDocument;

export type ProjectCollectionAccess = {
  broadRoleIds: string[];
  projectScopedRoleIdsByProjectId: Record<string, string[]>;
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

    const navigationAssignments = await this.listValidAssignments({
      organizationId: principal.activeOrganizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (navigationAssignments.length === 0) {
      return [];
    }

    const permissionKeys = await this.listPermissionKeysForRoleIds(
      navigationAssignments.map((assignment) => assignment.roleId),
    );
    if (permissionKeys.length === 0) {
      return [];
    }

    return permissionKeys;
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

    const assignments = await this.listValidAssignments({
      organizationId: scopeContext.organizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (assignments.length === 0) {
      return false;
    }

    const scopeMatchedAssignments = assignments.filter((assignment) => {
      if (scopeContext.allowProjectScope && assignment.scopeType === 'PROJECT') {
        return true;
      }

      return scopeContext.candidateScopes.some(
        (scope) =>
          scope.type === assignment.scopeType &&
          scope.id === assignment.scopeId,
      );
    });
    if (scopeMatchedAssignments.length === 0) {
      return false;
    }

    const permissionRoleIds = await this.listRoleIdsWithPermission(
      scopeMatchedAssignments.map((assignment) => assignment.roleId),
      permissionKey,
    );
    if (permissionRoleIds.length === 0) {
      return false;
    }

    if (!scopeContext.projectAccessRoleIds?.length) {
      return true;
    }

    const authorizedRoleIds = new Set(scopeContext.projectAccessRoleIds);
    return scopeMatchedAssignments.some((assignment) =>
      authorizedRoleIds.has(assignment.roleId),
    );
  }

  async getProjectCollectionAccess(
    principal: AuthenticatedPrincipal,
    input: { organizationId: string; moduleKey: string; permissionKey: string },
  ): Promise<ProjectCollectionAccess> {
    const assignments = await this.listValidAssignments({
      organizationId: input.organizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (assignments.length === 0) {
      return { broadRoleIds: [], projectScopedRoleIdsByProjectId: {} };
    }

    const permissionRoleIds = new Set(
      await this.listRoleIdsWithPermission(
        assignments.map((assignment) => assignment.roleId),
        input.permissionKey,
      ),
    );
    if (permissionRoleIds.size === 0) {
      return { broadRoleIds: [], projectScopedRoleIdsByProjectId: {} };
    }

    const broadRoleIds = new Set<string>();
    const projectScopedRoleIdsByProjectId: Record<string, string[]> = {};
    for (const assignment of assignments) {
      if (!permissionRoleIds.has(assignment.roleId)) {
        continue;
      }

      if (
        assignment.scopeType === 'ORGANIZATION' &&
        assignment.scopeId === input.organizationId
      ) {
        broadRoleIds.add(assignment.roleId);
        continue;
      }

      if (
        assignment.scopeType === 'MODULE' &&
        assignment.scopeId === input.moduleKey
      ) {
        broadRoleIds.add(assignment.roleId);
        continue;
      }

      if (assignment.scopeType === 'PROJECT') {
        const existing = projectScopedRoleIdsByProjectId[assignment.scopeId] ?? [];
        existing.push(assignment.roleId);
        projectScopedRoleIdsByProjectId[assignment.scopeId] = [
          ...new Set(existing),
        ];
      }
    }

    return {
      broadRoleIds: [...broadRoleIds],
      projectScopedRoleIdsByProjectId,
    };
  }

  async resolvePrimaryOrganizationForUser(
    userId: string,
  ): Promise<string | undefined> {
    const assignments = await this.listValidAssignments({
      principalType: 'USER',
      principalId: userId,
    });
    const assignment = assignments.sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime(),
    )[0];
    return assignment?.organizationId;
  }

  async listOrganizationsForUser(userId: string): Promise<string[]> {
    const assignments = await this.listValidAssignments({
      principalType: 'USER',
      principalId: userId,
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

  private async listValidAssignments(query: {
    organizationId?: string;
    principalType: 'USER' | 'SERVICE_ACCOUNT';
    principalId: string;
  }): Promise<ValidAssignment[]> {
    const assignments = await this.roleAssignmentModel.find({
      ...query,
      status: 'ACTIVE',
    });
    const now = Date.now();
    return assignments.filter((assignment) => {
      if (assignment.validFrom && assignment.validFrom.getTime() > now) {
        return false;
      }
      if (assignment.validTo && assignment.validTo.getTime() <= now) {
        return false;
      }
      return true;
    });
  }

  private async listRoleIdsWithPermission(
    roleIds: string[],
    permissionKey: string,
  ): Promise<string[]> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return [];
    }

    const [roles, permissions] = await Promise.all([
      this.roleModel.find({ _id: { $in: uniqueRoleIds }, status: 'ACTIVE' }),
      this.permissionDefinitionModel.find({ key: permissionKey, status: 'ACTIVE' }),
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

    return [...new Set(rolePermissions.map((rolePermission) => rolePermission.roleId))];
  }

  private async listPermissionKeysForRoleIds(roleIds: string[]): Promise<string[]> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return [];
    }

    const roles = await this.roleModel.find({ _id: { $in: uniqueRoleIds }, status: 'ACTIVE' });
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
          $in: rolePermissions.map((rolePermission) => rolePermission.permissionId),
        },
        status: 'ACTIVE',
      })
      .sort({ key: 1 });
    return [...new Set(permissions.map((permission) => permission.key))];
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
