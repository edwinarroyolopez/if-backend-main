import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private shuttingDown = false;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onApplicationShutdown() {
    this.shuttingDown = true;
  }

  live() {
    return { status: 'ok' as const };
  }

  ready() {
    const ready = Number(this.connection.readyState) === 1;
    const status = ready && !this.shuttingDown ? 'ok' : 'degraded';
    return {
      status,
      mongodb: ready ? 'connected' : 'disconnected',
      shuttingDown: this.shuttingDown,
    };
  }
}
