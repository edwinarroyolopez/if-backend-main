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
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await callback(session);
      });

      if (result === undefined) {
        throw new Error('Transaction callback did not return a value');
      }

      return result;
    } finally {
      await session.endSession();
    }
  }
}
