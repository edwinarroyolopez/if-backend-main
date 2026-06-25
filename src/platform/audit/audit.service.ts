import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { RequestContextService } from 'src/platform/http/request-context.service';
import { AuditLog, AuditLogDocument } from './audit.schema';

export type AuditRecordInput = Omit<AuditLog, 'createdAt'>;

export type AuditReadRecord = {
  id: string;
  _id: unknown;
  organizationId?: string;
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

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

  async findOne(filter: Record<string, unknown>) {
    const audit = await this.auditModel.findOne(filter);
    return audit ? toAuditReadRecord(audit) : null;
  }

  async findMany(filter: Record<string, unknown>, limit: number) {
    const audits = await this.auditModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);
    return audits.map(toAuditReadRecord);
  }
}

function toAuditReadRecord(audit: AuditLogDocument): AuditReadRecord {
  return {
    id: audit.id,
    _id: audit._id,
    organizationId: audit.organizationId,
    action: audit.action,
    actorId: audit.actorId,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId,
    before: audit.before,
    after: audit.after,
    metadata: audit.metadata,
    createdAt: audit.createdAt,
  };
}
