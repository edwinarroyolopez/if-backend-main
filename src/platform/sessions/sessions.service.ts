import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import { HumanSessionIssuerService } from './human-session-issuer.service';
import { SessionRefreshService } from './session-refresh.service';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly auditService: AuditService,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly humanSessionIssuerService: HumanSessionIssuerService,
    private readonly sessionRefreshService: SessionRefreshService,
  ) {}

  async register(input: {
    email: string;
    displayName: string;
    password: string;
    activeOrganizationId?: string;
  }) {
    return this.transactionManagerService.runInTransaction(async (session) => {
      const user = await this.identityService.registerUser(input, session);
      const tokens = await this.humanSessionIssuerService.issueHumanSession({
        user: {
          id: user.id,
          sessionVersion: user.sessionVersion,
          authorizationVersion: user.authorizationVersion,
        },
        session,
        activeOrganizationId: input.activeOrganizationId,
      });
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
        (await this.principalAuthorizationService.resolvePrimaryOrganizationForUser(
          user.id,
        ));
      const tokens = await this.humanSessionIssuerService.issueHumanSession({
        userId: user.id,
        session,
        activeOrganizationId,
      });
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
    return this.sessionRefreshService.refresh(refreshToken);
  }

  async logout(principal: AuthenticatedPrincipal) {
    await this.transactionManagerService.runInTransaction(async (session) => {
      await this.authSessionModel.updateOne(
        {
          _id: principal.sessionId,
          principalType: 'USER',
          userId: principal.sub,
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date(), revokeReason: 'LOGOUT' } },
        { session },
      );

      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          action: 'auth.logout',
          resourceType: 'AUTH_SESSION',
          resourceId: principal.sessionId,
        },
        session,
      );
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
    if (principal.principalType !== 'USER') {
      return {
        principal: {
          id: principal.sub,
          principalType: principal.principalType,
        },
        session: {
          sessionId: principal.sessionId,
          sessionKind: principal.sessionKind,
          activeOrganizationId: principal.activeOrganizationId,
          readOnly: principal.readOnly,
        },
      };
    }

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

  async capabilities(principal: AuthenticatedPrincipal) {
    return {
      activeOrganizationId: principal.activeOrganizationId ?? null,
      readOnly: principal.readOnly,
      moduleCapabilities:
        await this.principalAuthorizationService.listEffectivePermissionKeysForNavigation(
          principal,
        ),
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
    await this.transactionManagerService.runInTransaction(async (session) => {
      const revokedSession = await this.authSessionModel.findOneAndUpdate(
        {
          _id: sessionId,
          principalType: 'USER',
          userId: principal.sub,
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date(), revokeReason: 'REVOKED_BY_OWNER' } },
        { new: true, session },
      );
      if (!revokedSession) {
        throw new AppException(
          404,
          REASON_CODES.RESOURCE_NOT_FOUND,
          'Session was not found',
        );
      }

      await this.auditService.record(
        {
          actorType: 'USER',
          actorId: principal.sub,
          actorSessionId: principal.sessionId,
          action: 'auth.session.revoke',
          resourceType: 'AUTH_SESSION',
          resourceId: sessionId,
        },
        session,
      );
    });
  }

  async reissueAccessTokenForSession(
    sessionId: string,
  ): Promise<{ accessToken: string }> {
    return this.humanSessionIssuerService.reissueAccessTokenForSession(
      sessionId,
    );
  }
}
