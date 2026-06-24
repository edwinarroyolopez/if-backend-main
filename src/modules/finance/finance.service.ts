import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import {
  InvoiceRequest,
  InvoiceRequestDocument,
} from './invoice-request.schema';

@Injectable()
export class FinanceService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(InvoiceRequest.name)
    private readonly invoiceRequestModel: Model<InvoiceRequestDocument>,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'INVOICE';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const invoiceRequest = await this.invoiceRequestModel.findById(
      reference.resourceId,
    );
    if (!invoiceRequest) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Invoice request was not found',
      );
    }
    return {
      resourceType: 'INVOICE',
      resourceId: invoiceRequest.id,
      organizationId: invoiceRequest.organizationId,
      moduleKey: 'finance',
      candidateScopes: [
        { type: 'INVOICE', id: invoiceRequest.id },
        { type: 'MODULE', id: 'finance' },
        { type: 'ORGANIZATION', id: invoiceRequest.organizationId },
      ],
    };
  }

  async requestInvoice(
    principal: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      projectId: string;
      clientId: string;
      key: string;
      amountCents: number;
      currency: string;
    },
  ) {
    const [invoiceRequest] = await this.invoiceRequestModel.create([
      {
        ...input,
        status: 'REQUESTED',
        requestedBy: principal.sub,
      },
    ]);
    await this.auditService.record({
      actorType: principal.principalType,
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      organizationId: input.organizationId,
      action: 'finance.invoice.request',
      resourceType: 'INVOICE',
      resourceId: invoiceRequest.id,
      permissionKey: 'finance.invoice.request',
      after: { status: invoiceRequest.status },
    });
    return invoiceRequest;
  }

  async approveInvoice(
    principal: AuthenticatedPrincipal,
    invoiceRequestId: string,
  ) {
    const invoiceRequest =
      await this.invoiceRequestModel.findById(invoiceRequestId);
    if (!invoiceRequest) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Invoice request was not found',
      );
    }
    if (invoiceRequest.requestedBy === principal.sub) {
      throw new AppException(
        403,
        REASON_CODES.PERMISSION_DENIED,
        'Requester cannot self-approve invoice',
      );
    }

    invoiceRequest.status = 'APPROVED';
    invoiceRequest.approvedBy = principal.sub;
    await invoiceRequest.save();
    await this.auditService.record({
      actorType: principal.principalType,
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      organizationId: invoiceRequest.organizationId,
      action: 'finance.invoice.approve',
      resourceType: 'INVOICE',
      resourceId: invoiceRequest.id,
      permissionKey: 'finance.invoice.approve',
      after: { status: invoiceRequest.status },
    });
    return invoiceRequest;
  }
}
