import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import {
  SERVICE_PRINCIPAL_LOOKUP,
  ServicePrincipalLookup,
} from './service-principal-lookup.port';

@Injectable()
export class AccessTokenSessionValidator {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    @Inject(SERVICE_PRINCIPAL_LOOKUP)
    private readonly servicePrincipalLookup: ServicePrincipalLookup,
  ) {}

  async validate(
    payload: AuthenticatedPrincipal,
  ): Promise<AuthenticatedPrincipal> {
    if (
      !payload.sub ||
      !payload.sessionId ||
      !payload.sessionKind ||
      !payload.authorizationFingerprint
    ) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Access token is invalid',
      );
    }

    const session = await this.authSessionModel.findById(payload.sessionId);
    if (!session) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Access token is invalid',
      );
    }
    if (session.revokedAt) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_REVOKED,
        'Session has been revoked',
      );
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_EXPIRED,
        'Session has expired',
      );
    }

    if (payload.principalType === 'USER') {
      const user = await this.identityService.findUserById(payload.sub);
      if (!user || user.status !== 'ACTIVE') {
        throw new AppException(
          403,
          REASON_CODES.AUTH_ACCOUNT_SUSPENDED,
          'Account is not active',
        );
      }
      if (session.userId !== user.id || session.principalType !== 'USER') {
        throw new AppException(
          401,
          REASON_CODES.AUTH_REFRESH_INVALID,
          'Access token is invalid',
        );
      }
      if (
        user.sessionVersion !== payload.sessionVersion ||
        session.sessionVersion !== payload.sessionVersion
      ) {
        throw new AppException(
          401,
          REASON_CODES.AUTH_SESSION_REVOKED,
          'Session version is outdated',
        );
      }

      const authorizationContext =
        await this.principalAuthorizationService.getUserAuthorizationContext(
          user.id,
          session.activeOrganizationId,
        );
      if (
        authorizationContext.authorizationFingerprint !==
        payload.authorizationFingerprint
      ) {
        throw new AppException(
          401,
          REASON_CODES.PERMISSION_DENIED,
          'Authorization context is outdated',
        );
      }

      return {
        ...payload,
        sub: user.id,
        email: user.email,
        authorizationVersion: authorizationContext.authorizationVersion,
        authorizationFingerprint: authorizationContext.authorizationFingerprint,
        readOnly: session.readOnly,
        activeOrganizationId: session.activeOrganizationId,
      };
    }

    const serviceAccount =
      await this.servicePrincipalLookup.findServicePrincipalById(payload.sub);
    if (!serviceAccount || serviceAccount.status !== 'ACTIVE') {
      throw new AppException(
        403,
        REASON_CODES.SERVICE_ACCOUNT_SUSPENDED,
        'Service account is not active',
      );
    }
    if (
      session.serviceAccountId !== serviceAccount.id ||
      session.principalType !== 'SERVICE_ACCOUNT'
    ) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Access token is invalid',
      );
    }
    if (
      serviceAccount.sessionVersion !== payload.sessionVersion ||
      session.sessionVersion !== payload.sessionVersion
    ) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_REVOKED,
        'Session version is outdated',
      );
    }

    const authorizationContext =
      await this.principalAuthorizationService.getServiceAccountAuthorizationContext(
        {
          serviceAccountId: serviceAccount.id,
          authorizationVersion: serviceAccount.authorizationVersion,
          activeOrganizationId:
            session.activeOrganizationId ?? serviceAccount.organizationId,
        },
      );
    if (
      authorizationContext.authorizationFingerprint !==
      payload.authorizationFingerprint
    ) {
      throw new AppException(
        401,
        REASON_CODES.PERMISSION_DENIED,
        'Authorization context is outdated',
      );
    }

    return {
      ...payload,
      sub: serviceAccount.id,
      authorizationVersion: authorizationContext.authorizationVersion,
      authorizationFingerprint: authorizationContext.authorizationFingerprint,
      readOnly: session.readOnly,
      activeOrganizationId: session.activeOrganizationId,
    };
  }

  async revokeSession(userId: string, sessionId: string, reason: string) {
    return this.authSessionModel.findOneAndUpdate(
      { _id: sessionId, userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
      { new: true },
    );
  }
}
