import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import {
  IdempotencyKeyDocument,
  IdempotencyKeyRecord,
} from './idempotency.schema';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyKeyRecord.name)
    private readonly idempotencyModel: HydratedModel<IdempotencyKeyDocument>,
  ) {}

  async begin(
    organizationId: string,
    key: string,
    operation: string,
    session: ClientSession,
  ) {
    const existing = await this.idempotencyModel
      .findOne({ organizationId, key, operation })
      .session(session);
    if (existing) {
      if (existing.status === 'COMPLETED') {
        return { type: 'completed' as const, record: existing };
      }

      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Idempotent request is already in progress',
      );
    }

    const [created] = await this.idempotencyModel.create(
      [
        {
          organizationId,
          key,
          operation,
          status: 'IN_PROGRESS',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
      { session },
    );

    return { type: 'created' as const, record: created };
  }

  async complete(
    id: string,
    statusCode: number,
    responseBody: Record<string, unknown>,
    session: ClientSession,
  ) {
    await this.idempotencyModel.updateOne(
      { _id: id },
      {
        $set: {
          status: 'COMPLETED',
          responseStatusCode: statusCode,
          responseBody,
        },
      },
      { session },
    );
  }
}
