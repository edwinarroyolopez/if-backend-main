import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import {
  ResourceReference,
  ResourceScopeContext,
  ResourceScopeResolver,
} from 'src/platform/access-control/resource-scope.types';
import { Client, ClientDocument } from './client.schema';

@Injectable()
export class CrmService implements ResourceScopeResolver, OnModuleInit {
  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    private readonly resourceScopeService: ResourceScopeService,
  ) {}

  onModuleInit() {
    this.resourceScopeService.registerResolver(this);
  }

  supports(resourceType: string): boolean {
    return resourceType === 'CLIENT';
  }

  async resolve(reference: ResourceReference): Promise<ResourceScopeContext> {
    const client = await this.clientModel.findById(reference.resourceId);
    if (!client) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Client was not found',
      );
    }

    const moduleKey = reference.moduleKey ?? 'crm';
    return {
      resourceType: 'CLIENT',
      resourceId: client.id,
      organizationId: client.organizationId,
      moduleKey,
      candidateScopes: [
        { type: 'CLIENT', id: client.id },
        { type: 'MODULE', id: moduleKey },
        { type: 'ORGANIZATION', id: client.organizationId },
      ],
    };
  }

  async createClient(input: {
    organizationId: string;
    key: string;
    name: string;
    createdBy: string;
  }) {
    const [client] = await this.clientModel.create([
      {
        organizationId: input.organizationId,
        key: input.key.trim(),
        name: input.name.trim(),
        status: 'ACTIVE',
        createdBy: input.createdBy,
      },
    ]);
    return client;
  }

  async listClients(organizationId: string) {
    const clients = await this.clientModel
      .find({ organizationId })
      .sort({ name: 1 });
    return clients.map((client) => ({
      id: client.id,
      organizationId: client.organizationId,
      key: client.key,
      name: client.name,
      status: client.status,
    }));
  }

  async findById(clientId: string) {
    return this.clientModel.findById(clientId);
  }
}
