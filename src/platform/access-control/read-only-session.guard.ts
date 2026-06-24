import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';

@Injectable()
export class ReadOnlySessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; user?: AuthenticatedPrincipal }>();
    if (!request.user?.readOnly) {
      return true;
    }

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    throw new AppException(
      403,
      REASON_CODES.AUTH_READ_ONLY_SESSION,
      'Read-only session cannot perform writes',
    );
  }
}
