import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import argon2 from 'argon2';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  ServicePrincipalLookup,
  ServicePrincipalRecord,
} from 'src/platform/sessions/service-principal-lookup.port';
import { TechnicalSessionIssuerService } from 'src/platform/sessions/technical-session-issuer.service';
import {
  ServiceAccount,
  ServiceAccountDocument,
} from './service-account.schema';
import {
  ServiceCredential,
  ServiceCredentialDocument,
} from './service-credential.schema';
import { issueServiceAccessToken } from './service-account-token-issuer';

@Injectable()
export class IntegrationsService implements ServicePrincipalLookup {
  constructor(
    @InjectModel(ServiceAccount.name)
    private readonly serviceAccountModel: HydratedModel<ServiceAccountDocument>,
    @InjectModel(ServiceCredential.name)
    private readonly serviceCredentialModel: HydratedModel<ServiceCredentialDocument>,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly accessControlService: AccessControlService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly auditService: AuditService,
    private readonly technicalSessionIssuerService: TechnicalSessionIssuerService,
    private readonly configService: ConfigService,
  ) {}

  async createServiceAccount(
    principal: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      key: string;
      name: string;
      ownerModule: string;
      allowedAudiences: string[];
      roleId: string;
    },
  ) {
    const apiAudience =
      this.configService.getOrThrow<string>('app.jwtAudience');
    if (!input.allowedAudiences.includes(apiAudience)) {
      throw new AppException(
        422,
        REASON_CODES.VALIDATION_FAILED,
        'Service account must allow the API audience',
      );
    }

    const clientSecret = randomBytes(24).toString('hex');

    return this.transactionManagerService.runInTransaction(async (session) => {
      const [serviceAccount] = await this.serviceAccountModel.create(
        [
          {
            organizationId: input.organizationId,
            key: input.key,
            name: input.name,
            ownerModule: input.ownerModule,
            status: 'ACTIVE',
            sessionVersion: 0,
            authorizationVersion: 0,
            allowedAudiences: input.allowedAudiences,
          },
        ],
        { session },
      );

      const keyId = randomUUID();
      await this.serviceCredentialModel.create(
        [
          {
            serviceAccountId: serviceAccount.id,
            keyId,
            credentialType: 'CLIENT_SECRET',
            credentialHash: await argon2.hash(clientSecret),
            status: 'ACTIVE',
          },
        ],
        { session },
      );
      await this.accessControlService.assignRoleToPrincipal(
        {
          organizationId: input.organizationId,
          principalType: 'SERVICE_ACCOUNT',
          principalId: serviceAccount.id,
          roleId: input.roleId,
          scopeType: 'ORGANIZATION',
          scopeId: input.organizationId,
          assignedBy: principal.sub,
        },
        session,
      );
      serviceAccount.authorizationVersion += 1;
      await serviceAccount.save({ session });
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: input.organizationId,
          action: 'integrations.service_account.create',
          resourceType: 'SERVICE_ACCOUNT',
          resourceId: serviceAccount.id,
          permissionKey: 'integrations.service_account.create',
          after: {
            key: serviceAccount.key,
            ownerModule: serviceAccount.ownerModule,
          },
        },
        session,
      );

      return { serviceAccount, keyId, clientSecret };
    });
  }

  async rotateCredential(
    principal: AuthenticatedPrincipal,
    serviceAccountId: string,
  ) {
    const clientSecret = randomBytes(24).toString('hex');
    return this.transactionManagerService.runInTransaction(async (session) => {
      const serviceAccount = await this.serviceAccountModel
        .findById(serviceAccountId)
        .session(session);
      if (!serviceAccount) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Service account was not found',
        );
      }
      if (serviceAccount.organizationId !== principal.activeOrganizationId) {
        throw new AppException(
          403,
          REASON_CODES.PERMISSION_DENIED,
          'Service account is outside the active organization',
        );
      }
      if (serviceAccount.status !== 'ACTIVE') {
        throw new AppException(
          403,
          REASON_CODES.SERVICE_ACCOUNT_SUSPENDED,
          'Service account is not active',
        );
      }

      await this.serviceCredentialModel.updateMany(
        { serviceAccountId, status: 'ACTIVE' },
        { $set: { status: 'REVOKED' } },
        { session },
      );
      serviceAccount.sessionVersion += 1;
      await serviceAccount.save({ session });
      await this.technicalSessionIssuerService.revokeServiceAccountSessions(
        serviceAccountId,
        'CREDENTIAL_ROTATED',
        session,
      );

      const keyId = randomUUID();
      await this.serviceCredentialModel.create(
        [
          {
            serviceAccountId,
            keyId,
            credentialType: 'CLIENT_SECRET',
            credentialHash: await argon2.hash(clientSecret),
            status: 'ACTIVE',
          },
        ],
        { session },
      );
      await this.auditService.record(
        {
          actorType: principal.principalType,
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          organizationId: serviceAccount.organizationId,
          action: 'integrations.service_account.rotate',
          resourceType: 'SERVICE_ACCOUNT',
          resourceId: serviceAccountId,
          permissionKey: 'integrations.service_account.rotate',
          after: { sessionVersion: serviceAccount.sessionVersion },
        },
        session,
      );
      return { keyId, clientSecret };
    });
  }

  async issueServiceAccessToken(input: {
    keyId: string;
    clientSecret: string;
    audience: string;
  }) {
    return issueServiceAccessToken(
      {
        serviceAccountModel: this.serviceAccountModel,
        serviceCredentialModel: this.serviceCredentialModel,
        transactionManagerService: this.transactionManagerService,
        principalAuthorizationService: this.principalAuthorizationService,
        auditService: this.auditService,
        technicalSessionIssuerService: this.technicalSessionIssuerService,
        configService: this.configService,
      },
      input,
    );
  }

  async findServicePrincipalById(
    serviceAccountId: string,
  ): Promise<ServicePrincipalRecord | null> {
    const serviceAccount =
      await this.serviceAccountModel.findById(serviceAccountId);
    if (!serviceAccount) {
      return null;
    }

    return {
      id: serviceAccount.id,
      organizationId: serviceAccount.organizationId,
      status: serviceAccount.status,
      sessionVersion: serviceAccount.sessionVersion,
      authorizationVersion: serviceAccount.authorizationVersion,
      allowedAudiences: [...serviceAccount.allowedAudiences],
    };
  }

  async findServiceAccountById(serviceAccountId: string) {
    return this.serviceAccountModel.findById(serviceAccountId);
  }
}
