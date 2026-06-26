import { ProjectsLegacyBacklogOrdering } from './projects-legacy-backlog-ordering';
import {
  AppException,
  AuthenticatedPrincipal,
  ClientSession,
  REASON_CODES,
} from './projects-legacy.imports';
import {
  ProjectMembershipInput,
  ProjectMembershipReadModel,
  ProjectMembershipUpdate,
  ProjectTeamReadModel,
} from './projects-legacy.types';
import {
  applyProjectMembershipUpdates,
  assertExpectedMembershipVersion,
  coerceProjectMembershipReadModel,
  normalizeProjectMembershipInput,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyTeamActions extends ProjectsLegacyBacklogOrdering {
  async listProjectTeam(projectId: string): Promise<ProjectTeamReadModel> {
    const project = await this.getExistingProject(projectId);
    const memberships = await this.projectMembershipModel
      .find({ organizationId: project.organizationId, projectId: project.id })
      .sort({ status: 1, displayName: 1, createdAt: 1 });
    const items = memberships.map((membership) =>
      this.toProjectMembershipReadModel(membership),
    );
    return {
      items,
      capacityUnit: 'HOURS_PER_WEEK',
      activeCapacity: items
        .filter((item) => item.status === 'ACTIVE')
        .reduce((sum, item) => sum + item.capacity, 0),
    };
  }

  async createProjectMembershipForRequest(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ProjectMembershipInput,
    idempotencyKey: string,
    session: ClientSession,
  ): Promise<ProjectMembershipReadModel> {
    const project = await this.getProjectForWrite(projectId, session);
    const normalized = normalizeProjectMembershipInput(input);
    const operation = `projects.team.create:${project.id}:${normalized.userId ?? normalized.emailNormalized ?? normalized.displayName}:${normalized.role}:${normalized.capacity}:${normalized.status}`;
    const begun = await this.idempotencyService.begin(
      project.organizationId,
      idempotencyKey,
      operation,
      session,
    );
    if (begun.type === 'completed') {
      const response = coerceProjectMembershipReadModel(
        begun.record.responseBody,
      );
      if (response) return response;
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Stored idempotent team response is not reusable',
      );
    }
    if (normalized.status === 'ACTIVE') {
      await this.assertNoActiveMembershipDuplicate(
        project,
        normalized,
        session,
      );
    }
    const [membership] = await this.projectMembershipModel.create(
      [
        {
          organizationId: project.organizationId,
          projectId: project.id,
          userId: normalized.userId,
          displayName: normalized.displayName,
          email: normalized.email,
          emailNormalized: normalized.emailNormalized,
          role: normalized.role,
          capacity: normalized.capacity,
          status: normalized.status,
          version: 1,
          createdBy: principal.sub,
          updatedBy: principal.sub,
        },
      ],
      { session },
    );
    const response = this.toProjectMembershipReadModel(membership);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.team.create',
        resourceType: 'PROJECT_MEMBERSHIP',
        resourceId: membership.id,
        permissionKey: 'projects.team.manage',
        after: response,
        metadata: { projectId: project.id },
      },
      session,
    );
    await this.idempotencyService.complete(
      begun.record.id,
      201,
      response,
      session,
    );
    return response;
  }

  async updateProjectMembership(
    principal: AuthenticatedPrincipal,
    projectId: string,
    membershipId: string,
    updates: ProjectMembershipUpdate,
    session: ClientSession,
  ): Promise<ProjectMembershipReadModel> {
    const project = await this.getProjectForWrite(projectId, session);
    const membership = await this.getMembershipForProjectForWrite(
      project,
      membershipId,
      session,
    );
    assertExpectedMembershipVersion(membership, updates.expectedVersion);
    const before = this.toProjectMembershipReadModel(membership);
    const changed = applyProjectMembershipUpdates(membership, updates);
    if (!changed) {
      throw new AppException(
        409,
        REASON_CODES.RESOURCE_STATE_CONFLICT,
        'No team membership updates were provided',
      );
    }
    if (membership.status === 'ACTIVE') {
      await this.assertNoActiveMembershipDuplicate(
        project,
        membership,
        session,
      );
    }
    membership.version += 1;
    membership.updatedBy = principal.sub;
    await membership.save({ session });
    const response = this.toProjectMembershipReadModel(membership);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.team.update',
        resourceType: 'PROJECT_MEMBERSHIP',
        resourceId: membership.id,
        permissionKey: 'projects.team.manage',
        before,
        after: response,
        metadata: { projectId: project.id },
      },
      session,
    );
    return response;
  }

  async deactivateProjectMembership(
    principal: AuthenticatedPrincipal,
    projectId: string,
    membershipId: string,
    expectedVersion: number,
    session: ClientSession,
  ): Promise<ProjectMembershipReadModel> {
    const project = await this.getProjectForWrite(projectId, session);
    const membership = await this.getMembershipForProjectForWrite(
      project,
      membershipId,
      session,
    );
    assertExpectedMembershipVersion(membership, expectedVersion);
    const before = this.toProjectMembershipReadModel(membership);
    membership.status = 'INACTIVE';
    membership.deactivatedAt = new Date();
    membership.version += 1;
    membership.updatedBy = principal.sub;
    await membership.save({ session });
    const response = this.toProjectMembershipReadModel(membership);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.team.deactivate',
        resourceType: 'PROJECT_MEMBERSHIP',
        resourceId: membership.id,
        permissionKey: 'projects.team.manage',
        before,
        after: response,
        metadata: { projectId: project.id },
      },
      session,
    );
    return response;
  }

  async activateProjectMembership(
    principal: AuthenticatedPrincipal,
    projectId: string,
    membershipId: string,
    expectedVersion: number,
    session: ClientSession,
  ): Promise<ProjectMembershipReadModel> {
    const project = await this.getProjectForWrite(projectId, session);
    const membership = await this.getMembershipForProjectForWrite(
      project,
      membershipId,
      session,
    );
    assertExpectedMembershipVersion(membership, expectedVersion);
    const before = this.toProjectMembershipReadModel(membership);
    membership.status = 'ACTIVE';
    membership.deactivatedAt = undefined;
    await this.assertNoActiveMembershipDuplicate(project, membership, session);
    membership.version += 1;
    membership.updatedBy = principal.sub;
    await membership.save({ session });
    const response = this.toProjectMembershipReadModel(membership);
    await this.auditService.record(
      {
        actorType: principal.principalType,
        actorId: principal.sub,
        actorSessionId: principal.sessionId,
        organizationId: project.organizationId,
        action: 'projects.team.activate',
        resourceType: 'PROJECT_MEMBERSHIP',
        resourceId: membership.id,
        permissionKey: 'projects.team.manage',
        before,
        after: response,
        metadata: { projectId: project.id },
      },
      session,
    );
    return response;
  }
}
