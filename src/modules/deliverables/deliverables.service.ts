import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { Deliverable, DeliverableDocument } from './deliverable.schema';

@Injectable()
export class DeliverablesService
  implements ResourceScopeResolver, OnModuleInit
{
  constructor(
    @InjectModel(Deliverable.name)
    private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly projectsService: ProjectsService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly auditService: AuditService,
    private readonly transactionManagerService: TransactionManagerService,
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
    const project = await this.projectsService.findById(deliverable.projectId);
    return {
      resourceType: 'DELIVERABLE',
      resourceId: deliverable.id,
      organizationId: deliverable.organizationId,
      moduleKey: 'deliverables',
      projectId: deliverable.projectId,
      projectAccessRoleIds: project?.accessRoleIds ?? [],
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
    const project = await this.projectsService.findById(input.projectId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }
    if (project.organizationId !== input.organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Project does not belong to the requested organization',
      );
    }

    const [deliverable] = await this.deliverableModel.create([
      {
        organizationId: project.organizationId,
        projectId: project.id,
        key: input.key,
        name: input.name,
        status: 'DRAFT',
        createdBy: principal.sub,
      },
    ]);
    return deliverable;
  }

  async listDeliverables(principal: AuthenticatedPrincipal) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }

    const accessibleProjectIds = await this.projectsService.listAccessibleProjectIds(
      principal,
      'deliverables',
      'deliverables.deliverable.read',
    );
    if (accessibleProjectIds.length === 0) {
      return [];
    }

    const deliverables = await this.deliverableModel
      .find({ organizationId, projectId: { $in: accessibleProjectIds } })
      .sort({ createdAt: -1, _id: 1 });

    return deliverables.map((deliverable) => ({
      id: deliverable.id,
      organizationId: deliverable.organizationId,
      projectId: deliverable.projectId,
      key: deliverable.key,
      name: deliverable.name,
      status: deliverable.status,
    }));
  }

  async approveDeliverable(
    principal: AuthenticatedPrincipal,
    deliverableId: string,
  ) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const deliverable = await this.deliverableModel
        .findById(deliverableId)
        .session(session);
      if (!deliverable) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Deliverable was not found',
        );
      }
      if (deliverable.status === 'APPROVED') {
        return deliverable;
      }
      if (
        deliverable.status !== 'DRAFT' &&
        deliverable.status !== 'IN_REVIEW'
      ) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Deliverable cannot be approved from the current state',
        );
      }

      deliverable.status = 'APPROVED';
      await deliverable.save({ session });
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: deliverable.organizationId,
          action: 'deliverables.deliverable.approve',
          resourceType: 'DELIVERABLE',
          resourceId: deliverable.id,
          permissionKey: 'deliverables.deliverable.approve',
          after: { status: deliverable.status },
        },
        session,
      );
      return deliverable;
    });
  }
}
