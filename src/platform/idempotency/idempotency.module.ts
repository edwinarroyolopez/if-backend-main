import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IdempotencyKeyRecord,
  IdempotencyKeySchema,
} from './idempotency.schema';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotencyKeyRecord.name, schema: IdempotencyKeySchema },
    ]),
  ],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
