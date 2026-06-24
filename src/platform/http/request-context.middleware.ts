import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { sha256 } from 'src/common/utils/hash.util';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const requestId = request.header('x-request-id') ?? randomUUID();
    const correlationId = request.header('x-correlation-id') ?? requestId;
    Object.assign(request, { requestId, correlationId });
    response.setHeader('x-request-id', requestId);

    this.requestContextService.run(
      {
        requestId,
        correlationId,
        ipHash: request.ip ? sha256(request.ip) : undefined,
        userAgent: request.header('user-agent') ?? undefined,
      },
      next,
    );
  }
}
