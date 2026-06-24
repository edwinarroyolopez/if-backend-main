import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedPrincipal }>();
    return request.user;
  },
);
