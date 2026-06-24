import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  live() {
    return { status: 'ok' as const };
  }

  ready() {
    const ready = Number(this.connection.readyState) === 1;
    return {
      status: ready ? ('ok' as const) : ('degraded' as const),
      mongodb: ready ? 'connected' : 'disconnected',
    };
  }
}
