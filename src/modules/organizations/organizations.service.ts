import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  AuthSession,
  AuthSessionDocument,
} from 'src/platform/sessions/auth-session.schema';
import { SessionsService } from 'src/platform/sessions/sessions.service';
import { Organization, OrganizationDocument } from './organization.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly sessionsService: SessionsService,
  ) {}

  async bootstrapOrganization(
    principal: AuthenticatedPrincipal,
    input: { key: string; name: string },
  ) {
    const organization = await this.transactionManagerService.runInTransaction(
      async (session) => {
        const existing = await this.organizationModel
          .findOne({ key: input.key })
          .session(session);
        if (existing) {
          throw new AppException(
            409,
            REASON_CODES.VALIDATION_FAILED,
            'Organization key already exists',
          );
        }

        const [created] = await this.organizationModel.create(
          [
            {
              key: input.key.trim(),
              name: input.name.trim(),
              status: 'ACTIVE',
              createdBy: principal.sub,
            },
          ],
          { session },
        );

        await this.accessControlService.createDefaultRolesForOrganization(
          created.id,
          principal.sub,
          session,
        );
        await this.authSessionModel.updateOne(
          { _id: principal.sessionId },
          { $set: { activeOrganizationId: created.id } },
          { session },
        );
        await this.auditService.record(
          {
            actorType: principal.principalType,
            actorId: principal.sub,
            actorSessionId: principal.sessionId,
            organizationId: created.id,
            action: 'organization.bootstrap',
            resourceType: 'ORGANIZATION',
            resourceId: created.id,
            after: { key: created.key, name: created.name },
          },
          session,
        );

        return created;
      },
    );

    const reissued = await this.sessionsService.reissueAccessTokenForSession(
      principal.sessionId,
    );
    return {
      id: organization.id,
      key: organization.key,
      name: organization.name,
      accessToken: reissued.accessToken,
    };
  }

  async listAccessibleOrganizations(principal: AuthenticatedPrincipal) {
    const organizationIds =
      await this.accessControlService.listOrganizationsForUser(principal.sub);
    const organizations = await this.organizationModel
      .find({ _id: { $in: organizationIds } })
      .sort({ name: 1 });
    return organizations.map((organization) => ({
      id: organization.id,
      key: organization.key,
      name: organization.name,
      status: organization.status,
    }));
  }

  async findOrganizationById(organizationId: string, session?: ClientSession) {
    return session
      ? this.organizationModel.findById(organizationId).session(session)
      : this.organizationModel.findById(organizationId);
  }
}
