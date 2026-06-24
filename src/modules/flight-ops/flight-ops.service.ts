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
import { OutboxService } from 'src/platform/events/outbox.service';
import { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
import { Mission, MissionDocument } from './mission.schema';

@Injectable()
export class FlightOpsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Mission.name)
    private readonly missionModel: Model<MissionDocument>,
    private readonly projectsService: ProjectsService,
    private readonly resourceScopeService: ResourceScopeService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'MISSION';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const mission = await this.missionModel.findById(reference.resourceId);
    if (!mission) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Mission was not found',
      );
    }
    const project = await this.projectsService.findById(mission.projectId);

    return {
      resourceType: 'MISSION',
      resourceId: mission.id,
      organizationId: mission.organizationId,
      moduleKey: 'flight',
      projectId: mission.projectId,
      projectAccessRoleIds: project?.accessRoleIds ?? [],
      candidateScopes: [
        { type: 'MISSION', id: mission.id },
        { type: 'PROJECT', id: mission.projectId },
        { type: 'MODULE', id: 'flight' },
        { type: 'ORGANIZATION', id: mission.organizationId },
      ],
    };
  }

  async createMission(input: {
    organizationId: string;
    projectId: string;
    key: string;
    name: string;
    createdBy: string;
    status?: 'DRAFT' | 'PLANNED' | 'READY' | 'IN_PROGRESS';
  }) {
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

    const [mission] = await this.missionModel.create([
      {
        organizationId: project.organizationId,
        projectId: project.id,
        key: input.key.trim(),
        name: input.name.trim(),
        status: input.status ?? 'READY',
        createdBy: input.createdBy,
      },
    ]);
    return mission;
  }

  async getMission(missionId: string) {
    const mission = await this.missionModel.findById(missionId);
    if (!mission) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Mission was not found',
      );
    }
    return mission;
  }

  async listMissions(
    principal: AuthenticatedPrincipal,
    filters: {
      projectId?: string;
      status?:
        | 'DRAFT'
        | 'PLANNED'
        | 'READY'
        | 'IN_PROGRESS'
        | 'COMPLETED'
        | 'CANCELLED'
        | 'FAILED';
      },
  ) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }

    const accessibleProjectIds = await this.projectsService.listAccessibleProjectIds(
      principal,
      'flight',
      'flight.mission.read',
    );
    if (accessibleProjectIds.length === 0) {
      return [];
    }

    const query: {
      organizationId: string;
      projectId?: string | { $in: string[] };
      status?: string;
    } = {
      organizationId,
      projectId: { $in: accessibleProjectIds },
    };
    if (filters.projectId) {
      if (!accessibleProjectIds.includes(filters.projectId)) {
        return [];
      }
      query.projectId = filters.projectId;
    }
    if (filters.status) {
      query.status = filters.status;
    }

    const missions = await this.missionModel.find(query).sort({
      createdAt: -1,
      _id: 1,
    });

    return missions.map((mission) => ({
      id: mission.id,
      organizationId: mission.organizationId,
      projectId: mission.projectId,
      key: mission.key,
      name: mission.name,
      status: mission.status,
    }));
  }

  async completeMission(
    principal: AuthenticatedPrincipal,
    missionId: string,
    idempotencyKey: string,
  ) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const begun = await this.idempotencyService.begin(
        principal.activeOrganizationId!,
        idempotencyKey,
        `mission.complete:${missionId}`,
        session,
      );
      if (begun.type === 'completed') {
        return begun.record.responseBody ?? {};
      }

      const mission = await this.missionModel
        .findById(missionId)
        .session(session);
      if (!mission) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Mission was not found',
        );
      }

      if (!['READY', 'IN_PROGRESS'].includes(mission.status)) {
        if (mission.status === 'COMPLETED') {
          const response = {
            missionId: mission.id,
            status: mission.status,
            alreadyCompleted: true,
          };
          await this.idempotencyService.complete(
            begun.record.id,
            200,
            response,
            session,
          );
          return response;
        }

        throw new AppException(
          409,
          REASON_CODES.MISSION_NOT_COMPLETABLE,
          'Mission cannot be completed from the current state',
        );
      }

      const before = { status: mission.status };
      mission.status = 'COMPLETED';
      mission.completedAt = new Date();
      mission.completedBy = principal.sub;
      await mission.save({ session });

      const eventId = `mission-completed:${mission.id}`;
      const payload = {
        eventId,
        eventType: 'MissionCompleted',
        eventVersion: 1,
        occurredAt: mission.completedAt.toISOString(),
        organizationId: mission.organizationId,
        projectId: mission.projectId,
        missionId: mission.id,
        completedBy: principal.sub,
        correlationId: eventId,
      };

      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: mission.organizationId,
          action: 'flight.mission.complete',
          resourceType: 'MISSION',
          resourceId: mission.id,
          permissionKey: 'flight.mission.complete',
          before,
          after: { status: mission.status, completedBy: principal.sub },
        },
        session,
      );
      await this.outboxService.append(
        {
          eventId,
          eventType: 'MissionCompleted.v1',
          eventVersion: 1,
          aggregateType: 'MISSION',
          aggregateId: mission.id,
          payload,
          correlationId: eventId,
        },
        session,
      );

      const response = {
        missionId: mission.id,
        status: mission.status,
        eventId,
      };
      await this.idempotencyService.complete(
        begun.record.id,
        200,
        response,
        session,
      );
      return response;
    });
  }
}
