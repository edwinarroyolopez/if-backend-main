import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

@Injectable()
export class TransactionManagerService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async runInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();

    try {
      let completed = false;
      let result!: T;
      await session.withTransaction(async () => {
        result = await callback(session);
        completed = true;
      });

      if (!completed) {
        throw new Error('Transaction callback did not return a value');
      }

      return result;
    } finally {
      await session.endSession();
    }
  }
}
