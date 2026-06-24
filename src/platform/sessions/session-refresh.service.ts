import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { sha256 } from 'src/common/utils/hash.util';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import {
  HumanSessionIssuerService,
  IssuedHumanSession,
} from './human-session-issuer.service';
import {
  RefreshTokenPayload,
  SessionTokenService,
} from './session-token.service';

@Injectable()
export class SessionRefreshService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly auditService: AuditService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly humanSessionIssuerService: HumanSessionIssuerService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const refreshTokenHash = sha256(refreshToken);
    const authSession = await this.authSessionModel
      .findById(payload.sessionId)
      .select('+refreshTokenHash');
    if (
      !authSession ||
      authSession.principalType !== 'USER' ||
      authSession.userId !== payload.sub
    ) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Refresh token is invalid',
      );
    }

    if (authSession.expiresAt.getTime() <= Date.now()) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_EXPIRED,
        'Refresh token has expired',
      );
    }

    if (authSession.sessionVersion !== payload.sessionVersion) {
      await this.recordRefreshFailure(
        payload,
        'auth.refresh.stale_session_version',
        REASON_CODES.AUTH_REFRESH_SESSION_VERSION_STALE,
      );
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_SESSION_VERSION_STALE,
        'Refresh token is outdated',
      );
    }

    if (authSession.revokedAt) {
      if (
        authSession.revokeReason === 'ROTATED' &&
        authSession.refreshTokenHash === refreshTokenHash
      ) {
        await this.recordRefreshFailure(
          payload,
          'auth.refresh.replay',
          REASON_CODES.AUTH_REFRESH_TOKEN_CONSUMED,
        );
        throw new AppException(
          401,
          REASON_CODES.AUTH_REFRESH_TOKEN_CONSUMED,
          'Refresh token has already been consumed',
        );
      }

      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_REVOKED,
        'Session has been revoked',
      );
    }

    if (authSession.refreshTokenHash !== refreshTokenHash) {
      await this.recordRefreshFailure(
        payload,
        'auth.refresh.hash_mismatch',
        REASON_CODES.AUTH_REFRESH_TOKEN_MISMATCH,
      );
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_TOKEN_MISMATCH,
        'Refresh token is invalid',
      );
    }

    const user = await this.identityService.findUserById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(
        403,
        REASON_CODES.AUTH_ACCOUNT_SUSPENDED,
        'Account is not active',
      );
    }

    if (user.sessionVersion !== payload.sessionVersion) {
      await this.recordRefreshFailure(
        payload,
        'auth.refresh.stale_session_version',
        REASON_CODES.AUTH_REFRESH_SESSION_VERSION_STALE,
      );
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_SESSION_VERSION_STALE,
        'Refresh token is outdated',
      );
    }

    return this.transactionManagerService.runInTransaction(async (session) => {
      const rotatedSession = await this.authSessionModel.findOneAndUpdate(
        {
          _id: payload.sessionId,
          principalType: 'USER',
          userId: payload.sub,
          sessionVersion: payload.sessionVersion,
          refreshTokenHash,
          revokedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            revokedAt: new Date(),
            revokeReason: 'ROTATED',
          },
        },
        { new: true, session },
      );

      if (!rotatedSession) {
        await this.recordRefreshFailure(
          payload,
          'auth.refresh.concurrent_replay',
          REASON_CODES.AUTH_REFRESH_REPLAY_DETECTED,
        );
        throw new AppException(
          401,
          REASON_CODES.AUTH_REFRESH_REPLAY_DETECTED,
          'Refresh replay was detected',
        );
      }

      const issued = await this.issueReplacementSession(
        user.id,
        rotatedSession,
        session,
      );
      rotatedSession.replacedBySessionId = issued.sessionId;
      await rotatedSession.save({ session });
      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: user.id,
          actorSessionId: issued.sessionId,
          action: 'auth.refresh.rotate',
          resourceType: 'AUTH_SESSION',
          resourceId: rotatedSession.id,
          after: { replacedBySessionId: issued.sessionId },
        },
        session,
      );

      return {
        user: this.identityService.toPublicUser(user),
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        sessionId: issued.sessionId,
        activeOrganizationId: issued.activeOrganizationId,
      };
    });
  }

  private verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      const payload = this.sessionTokenService.verifyRefreshToken(refreshToken);
      if (payload.tokenType !== 'REFRESH') {
        throw new AppException(
          401,
          REASON_CODES.AUTH_REFRESH_INVALID,
          'Refresh token is invalid',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new AppException(
          401,
          REASON_CODES.AUTH_SESSION_EXPIRED,
          'Refresh token has expired',
        );
      }

      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Refresh token is invalid',
      );
    }
  }

  private async issueReplacementSession(
    userId: string,
    authSession: AuthSessionDocument,
    session: ClientSession,
  ): Promise<IssuedHumanSession> {
    return this.humanSessionIssuerService.issueHumanSession({
      userId,
      session,
      activeOrganizationId: authSession.activeOrganizationId,
      userAgent: authSession.userAgent,
      ipHash: authSession.ipHash,
    });
  }

  private async recordRefreshFailure(
    payload: RefreshTokenPayload,
    action: string,
    reasonCode: string,
  ): Promise<void> {
    await this.auditService.record({
      actorType: 'USER',
      actorId: payload.sub,
      actorSessionId: payload.sessionId,
      action,
      resourceType: 'AUTH_SESSION',
      resourceId: payload.sessionId,
      reasonCode,
    });
  }
}
