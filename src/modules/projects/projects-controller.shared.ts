import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';

export const PROJECT_RESOURCE = {
  type: 'PROJECT',
  param: 'projectId',
  moduleKey: 'projects',
} as const;

export function ProjectsControllerRoute() {
  return applyDecorators(
    Controller('projects'),
    UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard),
  );
}

export function requireIdempotencyKey(
  idempotencyKey: string | undefined,
): asserts idempotencyKey is string {
  if (!idempotencyKey) {
    throw new AppException(
      409,
      REASON_CODES.IDEMPOTENCY_CONFLICT,
      'Idempotency-Key header is required',
    );
  }
}
