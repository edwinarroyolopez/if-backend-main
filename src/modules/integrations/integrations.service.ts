import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import argon2 from 'argon2';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import {
  AuthSession,
  AuthSessionDocument,
} from 'src/platform/sessions/auth-session.schema';
import {
  ServiceAccount,
  ServiceAccountDocument,
} from './service-account.schema';
import {
  ServiceCredential,
  ServiceCredentialDocument,
} from './service-credential.schema';

type DurationExpression = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectModel(ServiceAccount.name)
    private readonly serviceAccountModel: Model<ServiceAccountDocument>,
    @InjectModel(ServiceCredential.name)
    private readonly serviceCredentialModel: Model<ServiceCredentialDocument>,
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
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
      await this.serviceCredentialModel.updateMany(
        { serviceAccountId, status: 'ACTIVE' },
        { $set: { status: 'REVOKED' } },
        { session },
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
          action: 'integrations.service_account.rotate',
          resourceType: 'SERVICE_ACCOUNT',
          resourceId: serviceAccountId,
          permissionKey: 'integrations.service_account.rotate',
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
    const credential = await this.serviceCredentialModel
      .findOne({ keyId: input.keyId, status: 'ACTIVE' })
      .select('+credentialHash');
    if (!credential?.credentialHash) {
      throw new AppException(
        401,
        REASON_CODES.SERVICE_CREDENTIAL_INVALID,
        'Service credential is invalid',
      );
    }
    const matches = await argon2.verify(
      credential.credentialHash,
      input.clientSecret,
    );
    if (!matches) {
      throw new AppException(
        401,
        REASON_CODES.SERVICE_CREDENTIAL_INVALID,
        'Service credential is invalid',
      );
    }

    const serviceAccount = await this.serviceAccountModel.findById(
      credential.serviceAccountId,
    );
    if (!serviceAccount || serviceAccount.status !== 'ACTIVE') {
      throw new AppException(
        403,
        REASON_CODES.SERVICE_ACCOUNT_SUSPENDED,
        'Service account is not active',
      );
    }
    if (!serviceAccount.allowedAudiences.includes(input.audience)) {
      throw new AppException(
        403,
        REASON_CODES.PERMISSION_DENIED,
        'Audience is not allowed for this service account',
      );
    }

    const authorizationVersion =
      await this.accessControlService.getEffectiveAuthorizationVersionForServiceAccount(
        serviceAccount.id,
        serviceAccount.authorizationVersion,
      );
    const sessionId = randomUUID();
    await this.authSessionModel.create([
      {
        _id: sessionId,
        principalType: 'SERVICE_ACCOUNT',
        serviceAccountId: serviceAccount.id,
        sessionKind: 'SERVICE_ACCOUNT',
        sessionVersion: serviceAccount.sessionVersion,
        authorizationVersion,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        readOnly: false,
        activeOrganizationId: serviceAccount.organizationId,
      },
    ]);

    await this.serviceCredentialModel.updateOne(
      { _id: credential.id },
      { $set: { lastUsedAt: new Date() } },
    );
    await this.auditService.record({
      actorType: 'SERVICE_ACCOUNT',
      actorId: serviceAccount.id,
      actorSessionId: sessionId,
      organizationId: serviceAccount.organizationId,
      action: 'integrations.service_account.token',
      resourceType: 'SERVICE_ACCOUNT',
      resourceId: serviceAccount.id,
    });

    const expiresIn = this.configService.getOrThrow<string>(
      'app.jwtAccessTtl',
    ) as DurationExpression;
    return {
      accessToken: this.jwtService.sign(
        {
          sub: serviceAccount.id,
          principalType: 'SERVICE_ACCOUNT',
          sessionId,
          sessionVersion: serviceAccount.sessionVersion,
          authorizationVersion,
          sessionKind: 'SERVICE_ACCOUNT',
          readOnly: false,
          activeOrganizationId: serviceAccount.organizationId,
        },
        {
          secret: this.configService.getOrThrow<string>('app.jwtAccessSecret'),
          issuer: this.configService.getOrThrow<string>('app.jwtIssuer'),
          audience: input.audience,
          algorithm: 'HS256',
          expiresIn,
          jwtid: randomUUID(),
        },
      ),
      sessionId,
    };
  }

  async findServiceAccountById(serviceAccountId: string) {
    return this.serviceAccountModel.findById(serviceAccountId);
  }
}
