import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import {
  REQUIRE_PERMISSION_KEY,
  RESOLVE_RESOURCE_KEY,
} from './access-control.decorators';
import { PrincipalAuthorizationService } from './principal-authorization.service';
import { ResourceScopeService } from './resource-scope.service';
import { ResolveResourceOptions } from './resource-scope.types';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly resourceScopeService: ResourceScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionKey = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissionKey) {
      return true;
    }

    const resourceOptions = this.reflector.getAllAndOverride<
      ResolveResourceOptions | undefined
    >(RESOLVE_RESOURCE_KEY, [context.getHandler(), context.getClass()]);
    if (!resourceOptions) {
      throw new AppException(
        403,
        REASON_CODES.PERMISSION_DENIED,
        'Permission metadata is incomplete',
      );
    }

    const request = context.switchToHttp().getRequest<
      Omit<Request, 'body'> & {
        user: AuthenticatedPrincipal;
        body?: Record<string, unknown>;
      }
    >();
    const scope = await this.resourceScopeService.resolveForRequest(
      request,
      resourceOptions,
    );
    const allowed = await this.principalAuthorizationService.can(
      request.user,
      permissionKey,
      scope,
    );
    if (!allowed) {
      throw new AppException(
        403,
        REASON_CODES.PERMISSION_DENIED,
        'Request could not be authorized',
      );
    }

    return true;
  }
}
