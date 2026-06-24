import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  correlationId: string;
  ipHash?: string;
  userAgent?: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(context: RequestContext, callback: () => void) {
    this.storage.run(context, callback);
  }

  get(): RequestContext {
    return (
      this.storage.getStore() ?? {
        requestId: 'unknown-request',
        correlationId: 'unknown-correlation',
      }
    );
  }
}
