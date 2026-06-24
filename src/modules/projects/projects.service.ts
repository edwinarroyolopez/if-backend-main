import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { Project, ProjectDocument } from './project.schema';

@Injectable()
export class ProjectsService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly resourceScopeService: ResourceScopeService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'PROJECT';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const project = await this.projectModel.findById(reference.resourceId);
    if (!project) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Project was not found',
      );
    }

    const moduleKey = reference.moduleKey ?? 'projects';
    return {
      resourceType: 'PROJECT',
      resourceId: project.id,
      organizationId: project.organizationId,
      moduleKey,
      candidateScopes: [
        { type: 'PROJECT', id: project.id },
        { type: 'MODULE', id: moduleKey },
        { type: 'ORGANIZATION', id: project.organizationId },
      ],
    };
  }

  async createProject(
    input: {
      organizationId: string;
      clientId: string;
      opportunityId?: string;
      key: string;
      name: string;
      createdBy: string;
    },
    session?: ClientSession,
  ) {
    const [project] = await this.projectModel.create(
      [
        {
          organizationId: input.organizationId,
          clientId: input.clientId,
          opportunityId: input.opportunityId,
          key: input.key.trim(),
          name: input.name.trim(),
          status: 'DRAFT',
          createdBy: input.createdBy,
        },
      ],
      session ? { session } : undefined,
    );
    return project;
  }

  async listProjects(organizationId: string) {
    const projects = await this.projectModel
      .find({ organizationId })
      .sort({ createdAt: -1 });
    return projects.map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      clientId: project.clientId,
      status: project.status,
    }));
  }

  async findById(projectId: string) {
    return this.projectModel.findById(projectId);
  }
}
