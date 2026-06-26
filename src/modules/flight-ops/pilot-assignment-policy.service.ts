import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { ResourceScopeContext } from 'src/platform/access-control/resource-scope.types';
import { IdentityService } from 'src/platform/identity/identity.service';
import { MissionDocument } from './mission.schema';

type ProjectAssignmentScope = {
  id: string;
  accessRoleIds?: string[];
};

@Injectable()
export class PilotAssignmentPolicy {
  constructor(
    private readonly identityService: IdentityService,
    private readonly authorizationService: PrincipalAuthorizationService,
  ) {}

  async assertAssignable(input: {
    assignedPilotId: string;
    organizationId: string;
    project: ProjectAssignmentScope;
    mission?: MissionDocument;
  }) {
    if (!Types.ObjectId.isValid(input.assignedPilotId)) {
      throwPilotNotFound();
    }

    const pilot = await this.identityService.findUserById(
      input.assignedPilotId,
    );
    if (!pilot || pilot.status !== 'ACTIVE') {
      throwPilotNotFound();
    }

    const pilotPrincipal = toPilotPrincipal(
      {
        id: pilot._id.toString(),
        email: pilot.email,
        authorizationVersion: pilot.authorizationVersion,
      },
      input.organizationId,
    );
    const scopeContext = toScopeContext(input);
    const canStart = await this.authorizationService.can(
      pilotPrincipal,
      'flight.request.start',
      scopeContext,
    );
    const canComplete = await this.authorizationService.can(
      pilotPrincipal,
      'flight.request.complete',
      scopeContext,
    );
    if (!canStart || !canComplete) {
      throwPilotNotFound();
    }
  }
}

function toPilotPrincipal(
  pilot: { id: string; authorizationVersion: number; email?: string },
  organizationId: string,
): AuthenticatedPrincipal {
  return {
    sub: pilot.id,
    principalType: 'USER',
    sessionId: 'pilot-assignment-policy',
    sessionVersion: 0,
    authorizationVersion: pilot.authorizationVersion,
    authorizationFingerprint: 'pilot-assignment-policy',
    sessionKind: 'HUMAN',
    readOnly: false,
    activeOrganizationId: organizationId,
    email: pilot.email,
  };
}

function toScopeContext(input: {
  organizationId: string;
  project: ProjectAssignmentScope;
  mission?: MissionDocument;
}): ResourceScopeContext {
  const candidateScopes: ResourceScopeContext['candidateScopes'] = [
    { type: 'PROJECT', id: input.project.id },
    { type: 'MODULE', id: 'flight' },
    { type: 'ORGANIZATION', id: input.organizationId },
  ];
  if (input.mission) {
    candidateScopes.unshift({ type: 'MISSION', id: input.mission.id });
  }

  return {
    resourceType: input.mission ? 'MISSION' : 'PROJECT',
    resourceId: input.mission?.id ?? input.project.id,
    organizationId: input.organizationId,
    moduleKey: 'flight',
    projectId: input.project.id,
    projectAccessRoleIds: input.project.accessRoleIds ?? [],
    candidateScopes,
  };
}

function throwPilotNotFound(): never {
  throw new AppException(
    404,
    REASON_CODES.RESOURCE_NOT_FOUND,
    'Pilot was not found',
  );
}
