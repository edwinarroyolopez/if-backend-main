import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import {
  ResolveResourceOptions,
  ResourceScopeContext,
  ResourceScopeResolver,
} from './resource-scope.types';

@Injectable()
export class ResourceScopeService {
  private readonly resolvers: ResourceScopeResolver[] = [];

  registerResolver(resolver: ResourceScopeResolver) {
    this.resolvers.push(resolver);
  }

  async resolveForRequest(
    request: Request & {
      user: AuthenticatedPrincipal;
      body?: Record<string, unknown>;
    },
    options: ResolveResourceOptions,
  ): Promise<ResourceScopeContext> {
    const principal = request.user;
    const resourceId = resolveResourceId(request, options);

    if (options.type === 'MODULE') {
      const organizationId = principal.activeOrganizationId;
      if (!organizationId || !options.moduleKey) {
        throw new AppException(
          403,
          REASON_CODES.SCOPE_NOT_COVERED,
          'Request scope is not covered',
        );
      }
      return {
        resourceType: 'MODULE',
        resourceId: options.moduleKey,
        organizationId,
        moduleKey: options.moduleKey,
        candidateScopes: [
          { type: 'MODULE', id: options.moduleKey },
          { type: 'ORGANIZATION', id: organizationId },
        ],
      };
    }

    if (options.type === 'ORGANIZATION') {
      const organizationId = resourceId ?? principal.activeOrganizationId;
      if (!organizationId) {
        throw new AppException(
          403,
          REASON_CODES.SCOPE_NOT_COVERED,
          'Request scope is not covered',
        );
      }
      return {
        resourceType: 'ORGANIZATION',
        resourceId: organizationId,
        organizationId,
        moduleKey: options.moduleKey ?? 'organization',
        candidateScopes: [
          ...(options.moduleKey
            ? [{ type: 'MODULE' as const, id: options.moduleKey }]
            : []),
          { type: 'ORGANIZATION', id: organizationId },
        ],
      };
    }

    if (!resourceId) {
      throw new AppException(
        403,
        REASON_CODES.SCOPE_NOT_COVERED,
        'Request scope is not covered',
      );
    }

    const resolver = this.resolvers.find((candidate) =>
      candidate.supports(options.type),
    );
    if (!resolver) {
      throw new AppException(
        403,
        REASON_CODES.SCOPE_NOT_COVERED,
        'Request scope is not covered',
      );
    }

    const resolved = await resolver.resolve({
      resourceType: options.type,
      resourceId,
      moduleKey: options.moduleKey,
      organizationId: principal.activeOrganizationId,
    });

    if (
      principal.activeOrganizationId &&
      principal.activeOrganizationId !== resolved.organizationId
    ) {
      throw new AppException(
        403,
        REASON_CODES.SCOPE_NOT_COVERED,
        'Request scope is not covered',
      );
    }

    return resolved;
  }
}

function resolveResourceId(
  request: Request & { body?: Record<string, unknown> },
  options: ResolveResourceOptions,
): string | undefined {
  if (options.param) {
    const value = request.params[options.param];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }

  if (options.bodyField) {
    const value = request.body?.[options.bodyField];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }

  return undefined;
}
