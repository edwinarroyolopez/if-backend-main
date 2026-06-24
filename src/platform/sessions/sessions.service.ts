import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { sha256 } from 'src/common/utils/hash.util';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import {
  RefreshTokenPayload,
  SessionTokenService,
} from './session-token.service';

type TokenBundle = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async register(input: {
    email: string;
    displayName: string;
    password: string;
    activeOrganizationId?: string;
  }) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const user = await this.identityService.registerUser(input, session);
      const tokens = await this.issueHumanSession(
        user.id,
        session,
        input.activeOrganizationId,
      );
      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: user.id,
          actorSessionId: tokens.sessionId,
          action: 'auth.register',
          resourceType: 'USER',
          resourceId: user.id,
          after: { email: user.email },
        },
        session,
      );

      return {
        user: this.identityService.toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
      };
    });
  }

  async login(input: {
    email: string;
    password: string;
    activeOrganizationId?: string;
  }) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const user = await this.identityService.authenticatePassword(
        input.email,
        input.password,
      );
      const activeOrganizationId =
        input.activeOrganizationId ??
        (await this.accessControlService.resolvePrimaryOrganizationForUser(
          user.id,
        ));
      const tokens = await this.issueHumanSession(
        user.id,
        session,
        activeOrganizationId,
      );
      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: user.id,
          actorSessionId: tokens.sessionId,
          action: 'auth.login',
          resourceType: 'USER',
          resourceId: user.id,
        },
        session,
      );

      return {
        user: this.identityService.toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
        activeOrganizationId,
      };
    });
  }

  async refresh(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.sessionTokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Refresh token is invalid',
      );
    }

    if (payload.tokenType !== 'REFRESH') {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Refresh token is invalid',
      );
    }

    return this.transactionManagerService.runInTransaction(async (session) => {
      const refreshTokenHash = sha256(refreshToken);
      const now = new Date();
      const authSession = await this.authSessionModel.findOneAndUpdate(
        {
          _id: payload.sessionId,
          principalType: 'USER',
          userId: payload.sub,
          sessionVersion: payload.sessionVersion,
          refreshTokenHash,
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        },
        {
          $set: {
            revokedAt: now,
            revokeReason: 'ROTATED',
          },
        },
        { new: true, session },
      );

      if (!authSession) {
        await this.auditService.record(
          {
            actorType: 'USER',
            actorId: payload.sub,
            actorSessionId: payload.sessionId,
            action: 'auth.refresh.replay',
            resourceType: 'AUTH_SESSION',
            resourceId: payload.sessionId,
            reasonCode: REASON_CODES.AUTH_REFRESH_REPLAY_DETECTED,
          },
          session,
        );
        throw new AppException(
          401,
          REASON_CODES.AUTH_REFRESH_REPLAY_DETECTED,
          'Refresh replay was detected',
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
        throw new AppException(
          401,
          REASON_CODES.AUTH_SESSION_REVOKED,
          'Session version is outdated',
        );
      }

      const issued = await this.issueHumanSession(
        user.id,
        session,
        authSession.activeOrganizationId,
        authSession.userAgent,
        authSession.ipHash,
      );
      authSession.replacedBySessionId = issued.sessionId;
      await authSession.save({ session });
      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: user.id,
          actorSessionId: issued.sessionId,
          action: 'auth.refresh.rotate',
          resourceType: 'AUTH_SESSION',
          resourceId: authSession.id,
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

  async logout(principal: AuthenticatedPrincipal) {
    await this.authSessionModel.updateOne(
      {
        _id: principal.sessionId,
        principalType: 'USER',
        userId: principal.sub,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date(), revokeReason: 'LOGOUT' } },
    );

    await this.auditService.record({
      actorType: 'USER',
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      action: 'auth.logout',
      resourceType: 'AUTH_SESSION',
      resourceId: principal.sessionId,
    });
  }

  async logoutAll(principal: AuthenticatedPrincipal) {
    await this.transactionManagerService.runInTransaction(async (session) => {
      const user = await this.identityService.bumpSessionVersion(
        principal.sub,
        session,
      );
      if (!user) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'User was not found',
        );
      }

      await this.authSessionModel.updateMany(
        {
          principalType: 'USER',
          userId: principal.sub,
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date(), revokeReason: 'LOGOUT_ALL' } },
        { session },
      );
      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          action: 'auth.logout_all',
          resourceType: 'USER',
          resourceId: principal.sub,
          after: { sessionVersion: user.sessionVersion },
        },
        session,
      );
    });
  }

  async me(principal: AuthenticatedPrincipal) {
    const user = await this.identityService.findUserById(principal.sub);
    if (!user) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'User was not found',
      );
    }
    return {
      user: this.identityService.toPublicUser(user),
      session: {
        sessionId: principal.sessionId,
        sessionKind: principal.sessionKind,
        activeOrganizationId: principal.activeOrganizationId,
        readOnly: principal.readOnly,
      },
    };
  }

  async listSessions(principal: AuthenticatedPrincipal) {
    const sessions = await this.authSessionModel
      .find({
        principalType: 'USER',
        userId: principal.sub,
        revokedAt: { $exists: false },
      })
      .sort({ createdAt: -1 });
    return sessions.map((session) => ({
      id: session.id,
      sessionKind: session.sessionKind,
      activeOrganizationId: session.activeOrganizationId,
      readOnly: session.readOnly,
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
    }));
  }

  async revokeOwnSession(principal: AuthenticatedPrincipal, sessionId: string) {
    const session = await this.authSessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        principalType: 'USER',
        userId: principal.sub,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date(), revokeReason: 'REVOKED_BY_OWNER' } },
      { new: true },
    );
    if (!session) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Session was not found',
      );
    }

    await this.auditService.record({
      actorType: 'USER',
      actorId: principal.sub,
      actorSessionId: principal.sessionId,
      action: 'auth.session.revoke',
      resourceType: 'AUTH_SESSION',
      resourceId: sessionId,
    });
  }

  async reissueAccessTokenForSession(
    sessionId: string,
  ): Promise<{ accessToken: string }> {
    const session = await this.authSessionModel.findById(sessionId);
    if (!session || !session.userId) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Session was not found',
      );
    }

    const authorizationVersion =
      await this.accessControlService.getEffectiveAuthorizationVersionForUser(
        session.userId,
      );
    session.authorizationVersion = authorizationVersion;
    await session.save();

    return {
      accessToken: this.sessionTokenService.issueAccessToken({
        sub: session.userId,
        principalType: 'USER',
        sessionId: session.id,
        sessionVersion: session.sessionVersion,
        authorizationVersion,
        sessionKind: session.sessionKind,
        readOnly: session.readOnly,
        activeOrganizationId: session.activeOrganizationId,
      }),
    };
  }

  private async issueHumanSession(
    userId: string,
    session: ClientSession,
    activeOrganizationId?: string,
    userAgent?: string,
    ipHash?: string,
  ): Promise<
    TokenBundle & { sessionId: string; activeOrganizationId?: string }
  > {
    const user = await this.identityService.findUserById(userId);
    if (!user) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'User was not found',
      );
    }

    const authorizationVersion =
      await this.accessControlService.getEffectiveAuthorizationVersionForUser(
        user.id,
      );
    const sessionId = randomUUID();
    const refreshToken = this.sessionTokenService.issueRefreshToken({
      sub: user.id,
      sessionId,
      sessionVersion: user.sessionVersion,
      principalType: 'USER',
    });

    await this.authSessionModel.create(
      [
        {
          _id: sessionId,
          principalType: 'USER',
          userId: user.id,
          sessionKind: 'HUMAN',
          refreshTokenHash: sha256(refreshToken),
          sessionVersion: user.sessionVersion,
          authorizationVersion,
          expiresAt: new Date(
            Date.now() + this.sessionTokenService.getRefreshTtlMs(),
          ),
          readOnly: false,
          activeOrganizationId,
          userAgent,
          ipHash,
        },
      ],
      { session },
    );

    const accessToken = this.sessionTokenService.issueAccessToken({
      sub: user.id,
      principalType: 'USER',
      sessionId,
      sessionVersion: user.sessionVersion,
      authorizationVersion,
      sessionKind: 'HUMAN',
      readOnly: false,
      activeOrganizationId,
    });

    return { accessToken, refreshToken, sessionId, activeOrganizationId };
  }
}
