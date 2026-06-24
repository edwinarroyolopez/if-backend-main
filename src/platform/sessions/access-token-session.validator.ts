import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { IntegrationsService } from 'src/modules/integrations/integrations.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';

@Injectable()
export class AccessTokenSessionValidator {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly accessControlService: AccessControlService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  async validate(
    payload: AuthenticatedPrincipal,
  ): Promise<AuthenticatedPrincipal> {
    if (!payload.sub || !payload.sessionId || !payload.sessionKind) {
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

      const effectiveVersion =
        await this.accessControlService.getEffectiveAuthorizationVersionForUser(
          user.id,
        );
      if (effectiveVersion !== payload.authorizationVersion) {
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
        authorizationVersion: effectiveVersion,
        readOnly: session.readOnly,
        activeOrganizationId: session.activeOrganizationId,
      };
    }

    const serviceAccount =
      await this.integrationsService.findServiceAccountById(payload.sub);
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

    const effectiveVersion =
      await this.accessControlService.getEffectiveAuthorizationVersionForServiceAccount(
        serviceAccount.id,
        serviceAccount.authorizationVersion,
      );
    if (effectiveVersion !== payload.authorizationVersion) {
      throw new AppException(
        401,
        REASON_CODES.PERMISSION_DENIED,
        'Authorization context is outdated',
      );
    }

    return {
      ...payload,
      sub: serviceAccount.id,
      authorizationVersion: effectiveVersion,
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
