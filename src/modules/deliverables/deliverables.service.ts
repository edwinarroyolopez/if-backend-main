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
import { Deliverable, DeliverableDocument } from './deliverable.schema';

@Injectable()
export class DeliverablesService
  implements ResourceScopeResolver, OnModuleInit
{
  constructor(
    @InjectModel(Deliverable.name)
    private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'DELIVERABLE';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const deliverable = await this.deliverableModel.findById(
      reference.resourceId,
    );
    if (!deliverable) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Deliverable was not found',
      );
    }
    return {
      resourceType: 'DELIVERABLE',
      resourceId: deliverable.id,
      organizationId: deliverable.organizationId,
      moduleKey: 'deliverables',
      candidateScopes: [
        { type: 'DELIVERABLE', id: deliverable.id },
        { type: 'PROJECT', id: deliverable.projectId },
        { type: 'MODULE', id: 'deliverables' },
        { type: 'ORGANIZATION', id: deliverable.organizationId },
      ],
    };
  }

  async createDeliverable(
    principal: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      projectId: string;
      key: string;
      name: string;
    },
  ) {
    const [deliverable] = await this.deliverableModel.create([
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        key: input.key,
        name: input.name,
        status: 'DRAFT',
        createdBy: principal.sub,
      },
    ]);
    return deliverable;
  }

  async approveDeliverable(
    principal: AuthenticatedPrincipal,
    deliverableId: string,
  ) {
    const deliverable = await this.deliverableModel.findById(deliverableId);
    if (!deliverable) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Deliverable was not found',
      );
    }
    deliverable.status = 'APPROVED';
    await deliverable.save();
    await this.auditService.record({
      actorType: principal.principalType,
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      organizationId: deliverable.organizationId,
      action: 'deliverables.deliverable.approve',
      resourceType: 'DELIVERABLE',
      resourceId: deliverable.id,
      permissionKey: 'deliverables.deliverable.approve',
      after: { status: deliverable.status },
    });
    return deliverable;
  }
}
