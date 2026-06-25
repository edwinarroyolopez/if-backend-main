import { Injectable } from '@nestjs/common';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { IdentityService } from 'src/platform/identity/identity.service';
import { buildAuthorizationFingerprint } from './authorization-fingerprint';
import { PrincipalAuthorizationStore } from './principal-authorization-store.service';
import { ResourceScopeContext } from './resource-scope.types';

export type AuthorizationContextSnapshot = {
  authorizationVersion: number;
  authorizationFingerprint: string;
};

export type ProjectCollectionAccess = {
  broadRoleIds: string[];
  projectScopedRoleIdsByProjectId: Record<string, string[]>;
};

@Injectable()
export class PrincipalAuthorizationService {
  constructor(
    private readonly store: PrincipalAuthorizationStore,
    private readonly identityService: IdentityService,
  ) {}

  async listEffectivePermissionKeysForNavigation(
    principal: AuthenticatedPrincipal,
  ): Promise<string[]> {
    if (!principal.activeOrganizationId) {
      return [];
    }

    const navigationAssignments = await this.store.listValidAssignments({
      organizationId: principal.activeOrganizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (navigationAssignments.length === 0) {
      return [];
    }

    const permissionKeys = await this.store.listPermissionKeysForRoleIds(
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
      await this.store.loadAuthorizationGraphForPrincipal({
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
      await this.store.loadAuthorizationGraphForPrincipal({
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

    const assignments = await this.store.listValidAssignments({
      organizationId: scopeContext.organizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (assignments.length === 0) {
      return false;
    }

    const scopeMatchedAssignments = assignments.filter((assignment) => {
      if (
        scopeContext.allowProjectScope &&
        assignment.scopeType === 'PROJECT'
      ) {
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

    const permissionRoleIds = await this.store.listRoleIdsWithPermission(
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
    const assignments = await this.store.listValidAssignments({
      organizationId: input.organizationId,
      principalType: principal.principalType,
      principalId: principal.sub,
    });
    if (assignments.length === 0) {
      return { broadRoleIds: [], projectScopedRoleIdsByProjectId: {} };
    }

    const permissionRoleIds = new Set(
      await this.store.listRoleIdsWithPermission(
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
        const existing =
          projectScopedRoleIdsByProjectId[assignment.scopeId] ?? [];
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
    const assignments = await this.store.listValidAssignments({
      principalType: 'USER',
      principalId: userId,
    });
    const assignment = assignments.sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    )[0];
    return assignment?.organizationId;
  }

  async listOrganizationsForUser(userId: string): Promise<string[]> {
    const assignments = await this.store.listValidAssignments({
      principalType: 'USER',
      principalId: userId,
    });
    return [
      ...new Set(assignments.map((assignment) => assignment.organizationId)),
    ];
  }
}
