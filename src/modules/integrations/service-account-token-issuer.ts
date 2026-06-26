import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { TechnicalSessionIssuerService } from 'src/platform/sessions/technical-session-issuer.service';
import { ServiceAccountDocument } from './service-account.schema';
import { ServiceCredentialDocument } from './service-credential.schema';

type ServiceAccountTokenIssuerDeps = {
  serviceAccountModel: HydratedModel<ServiceAccountDocument>;
  serviceCredentialModel: HydratedModel<ServiceCredentialDocument>;
  transactionManagerService: TransactionManagerService;
  principalAuthorizationService: PrincipalAuthorizationService;
  auditService: AuditService;
  technicalSessionIssuerService: TechnicalSessionIssuerService;
  configService: ConfigService;
};

export async function issueServiceAccessToken(
  deps: ServiceAccountTokenIssuerDeps,
  input: { keyId: string; clientSecret: string; audience: string },
) {
  const apiAudience = deps.configService.getOrThrow<string>('app.jwtAudience');
  if (input.audience !== apiAudience) {
    throw new AppException(
      403,
      REASON_CODES.PERMISSION_DENIED,
      'Audience is not allowed for this API',
    );
  }

  const credential = await deps.serviceCredentialModel
    .findOne({ keyId: input.keyId, status: 'ACTIVE' })
    .select('+credentialHash');
  if (!credential?.credentialHash) {
    throwInvalidCredential();
  }
  if (credential.expiresAt && credential.expiresAt <= new Date()) {
    throwInvalidCredential();
  }
  const matches = await argon2.verify(
    credential.credentialHash,
    input.clientSecret,
  );
  if (!matches) {
    throwInvalidCredential();
  }

  const serviceAccount = await deps.serviceAccountModel.findById(
    credential.serviceAccountId,
  );
  if (!serviceAccount || serviceAccount.status !== 'ACTIVE') {
    throw new AppException(
      403,
      REASON_CODES.SERVICE_ACCOUNT_SUSPENDED,
      'Service account is not active',
    );
  }
  if (!serviceAccount.allowedAudiences.includes(apiAudience)) {
    throw new AppException(
      403,
      REASON_CODES.PERMISSION_DENIED,
      'Audience is not allowed for this service account',
    );
  }

  return deps.transactionManagerService.runInTransaction(async (session) => {
    const authorizationContext =
      await deps.principalAuthorizationService.getServiceAccountAuthorizationContext(
        {
          serviceAccountId: serviceAccount.id,
          authorizationVersion: serviceAccount.authorizationVersion,
          activeOrganizationId: serviceAccount.organizationId,
        },
      );
    const issued =
      await deps.technicalSessionIssuerService.issueServiceAccountSession({
        serviceAccountId: serviceAccount.id,
        sessionVersion: serviceAccount.sessionVersion,
        authorizationVersion: authorizationContext.authorizationVersion,
        authorizationFingerprint: authorizationContext.authorizationFingerprint,
        activeOrganizationId: serviceAccount.organizationId,
        session,
      });

    await deps.serviceCredentialModel.updateOne(
      { _id: credential.id },
      { $set: { lastUsedAt: new Date() } },
      { session },
    );
    await deps.auditService.record(
      {
        actorType: 'SERVICE_ACCOUNT',
        actorId: serviceAccount.id,
        actorSessionId: issued.sessionId,
        organizationId: serviceAccount.organizationId,
        action: 'integrations.service_account.token',
        resourceType: 'SERVICE_ACCOUNT',
        resourceId: serviceAccount.id,
      },
      session,
    );

    return {
      accessToken: issued.accessToken,
      sessionId: issued.sessionId,
    };
  });
}

function throwInvalidCredential(): never {
  throw new AppException(
    401,
    REASON_CODES.SERVICE_CREDENTIAL_INVALID,
    'Service credential is invalid',
  );
}
