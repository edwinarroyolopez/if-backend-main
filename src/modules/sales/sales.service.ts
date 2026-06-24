import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AuditService } from 'src/platform/audit/audit.service';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { Opportunity, OpportunityDocument } from './opportunity.schema';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
  ) {}

  async createOpportunity(input: {
    organizationId: string;
    clientId: string;
    name: string;
    createdBy: string;
  }) {
    const [opportunity] = await this.opportunityModel.create([
      {
        organizationId: input.organizationId,
        clientId: input.clientId,
        name: input.name.trim(),
        status: 'OPEN',
        createdBy: input.createdBy,
      },
    ]);
    return opportunity;
  }

  async listOpportunities(organizationId: string) {
    const opportunities = await this.opportunityModel
      .find({ organizationId })
      .sort({ createdAt: -1, _id: 1 });

    return opportunities.map((opportunity) => ({
      id: opportunity.id,
      organizationId: opportunity.organizationId,
      clientId: opportunity.clientId,
      projectId: opportunity.projectId,
      name: opportunity.name,
      status: opportunity.status,
    }));
  }

  async convertOpportunityToProject(
    principal: AuthenticatedPrincipal,
    opportunityId: string,
    input: { projectKey: string; projectName: string },
    session: ClientSession,
  ) {
    const opportunity = await this.opportunityModel
      .findById(opportunityId)
      .session(session);
    if (!opportunity) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Opportunity was not found',
      );
    }
    if (opportunity.organizationId !== principal.activeOrganizationId) {
      throw new AppException(
        403,
        REASON_CODES.PERMISSION_DENIED,
        'Opportunity is outside the active organization',
      );
    }
    if (opportunity.status !== 'OPEN') {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'Opportunity is not convertible',
      );
    }

    const project = await this.projectsService.createProject(
      {
        organizationId: opportunity.organizationId,
        clientId: opportunity.clientId,
        opportunityId: opportunity.id,
        key: input.projectKey,
        name: input.projectName,
        createdBy: principal.sub,
      },
      session,
    );

    opportunity.status = 'CONVERTED';
    opportunity.projectId = project.id;
    await opportunity.save({ session });
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: opportunity.organizationId,
        action: 'sales.opportunity.convert_to_project',
        resourceType: 'OPPORTUNITY',
        resourceId: opportunity.id,
        permissionKey: 'sales.opportunity.convert_to_project',
        after: {
          status: opportunity.status,
          projectId: project.id,
        },
      },
      session,
    );
    return { opportunity, project };
  }
}
