import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { Opportunity, OpportunityDocument } from './opportunity.schema';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    private readonly projectsService: ProjectsService,
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

  async convertOpportunityToProject(
    opportunityId: string,
    input: { projectKey: string; projectName: string; actorUserId: string },
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
        createdBy: input.actorUserId,
      },
      session,
    );

    opportunity.status = 'CONVERTED';
    opportunity.projectId = project.id;
    await opportunity.save({ session });
    return { opportunity, project };
  }
}
