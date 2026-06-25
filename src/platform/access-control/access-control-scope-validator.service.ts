import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from './permission-definition.schema';
import { ResourceScopeService } from './resource-scope.service';
import { ResourceScopeContext } from './resource-scope.types';

@Injectable()
export class AccessControlScopeValidatorService {
  constructor(
    @InjectModel(PermissionDefinition.name)
    private readonly permissionDefinitionModel: Model<PermissionDefinitionDocument>,
    private readonly resourceScopeService: ResourceScopeService,
  ) {}

  async assertScopeBelongsToOrganization(
    organizationId: string,
    scopeType: ResourceScopeContext['candidateScopes'][number]['type'],
    scopeId: string,
    session: ClientSession,
  ) {
    if (scopeType === 'ORGANIZATION') {
      if (scopeId !== organizationId) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Role assignment organization scope is invalid',
        );
      }
      return;
    }

    if (scopeType === 'MODULE') {
      const modulePermission = await this.permissionDefinitionModel
        .findOne({ moduleKey: scopeId, status: 'ACTIVE' })
        .session(session);
      if (!modulePermission) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Role assignment module scope is invalid',
        );
      }
      return;
    }

    const resourceType = scopeType === 'PROJECT' ? 'PROJECT' : scopeType;
    const context = await this.resourceScopeService.resolveResourceReference({
      resourceType,
      resourceId: scopeId,
      organizationId,
    });
    if (context.organizationId !== organizationId) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        scopeType === 'PROJECT'
          ? 'Project scope is outside the requested organization'
          : 'Assignment scope is outside the requested organization',
      );
    }
  }
}
