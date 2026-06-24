import { SetMetadata } from '@nestjs/common';
import { ResolveResourceOptions } from './resource-scope.types';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const RESOLVE_RESOURCE_KEY = 'resolve_resource';

export const RequirePermission = (permissionKey: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissionKey);

export const ResolveResource = (options: ResolveResourceOptions) =>
  SetMetadata(RESOLVE_RESOURCE_KEY, options);
