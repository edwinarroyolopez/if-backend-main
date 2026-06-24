import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { RequestContextService } from 'src/platform/http/request-context.service';
import { AuditLog, AuditLogDocument } from './audit.schema';

export type AuditRecordInput = Omit<AuditLog, 'createdAt'>;

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly requestContextService: RequestContextService,
  ) {}

  async record(input: AuditRecordInput, session?: ClientSession) {
    const context = this.requestContextService.get();
    await this.auditModel.create(
      [
        {
          ...input,
          requestId: input.requestId ?? context.requestId,
          correlationId: input.correlationId ?? context.correlationId,
          ipHash: input.ipHash ?? context.ipHash,
          userAgent: input.userAgent ?? context.userAgent,
        },
      ],
      session ? { session } : undefined,
    );
  }
}
