import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { sha256 } from 'src/common/utils/hash.util';
import { PrincipalAuthorizationService } from 'src/platform/access-control/principal-authorization.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import { SessionTokenService } from './session-token.service';

type HumanSessionSubject = {
  id: string;
  sessionVersion: number;
  authorizationVersion: number;
};

export type IssuedHumanSession = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  activeOrganizationId?: string;
};

@Injectable()
export class HumanSessionIssuerService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly identityService: IdentityService,
    private readonly principalAuthorizationService: PrincipalAuthorizationService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async issueHumanSession(input: {
    userId?: string;
    user?: HumanSessionSubject;
    session: ClientSession;
    activeOrganizationId?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<IssuedHumanSession> {
    const user =
      input.user ??
      (input.userId
        ? await this.identityService.findUserById(input.userId)
        : null);
    if (!user) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'User was not found',
      );
    }

    const authorizationContext =
      await this.principalAuthorizationService.getUserAuthorizationContext(
        user.id,
        input.activeOrganizationId,
        user.authorizationVersion,
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
          authorizationVersion: authorizationContext.authorizationVersion,
          authorizationFingerprint:
            authorizationContext.authorizationFingerprint,
          expiresAt: new Date(
            Date.now() + this.sessionTokenService.getRefreshTtlMs(),
          ),
          readOnly: false,
          activeOrganizationId: input.activeOrganizationId,
          userAgent: input.userAgent,
          ipHash: input.ipHash,
        },
      ],
      { session: input.session },
    );

    const accessToken = this.sessionTokenService.issueAccessToken({
      sub: user.id,
      principalType: 'USER',
      sessionId,
      sessionVersion: user.sessionVersion,
      authorizationVersion: authorizationContext.authorizationVersion,
      authorizationFingerprint: authorizationContext.authorizationFingerprint,
      sessionKind: 'HUMAN',
      readOnly: false,
      activeOrganizationId: input.activeOrganizationId,
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      activeOrganizationId: input.activeOrganizationId,
    };
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

    const authorizationContext =
      await this.principalAuthorizationService.getUserAuthorizationContext(
        session.userId,
        session.activeOrganizationId,
      );
    session.authorizationVersion = authorizationContext.authorizationVersion;
    session.authorizationFingerprint =
      authorizationContext.authorizationFingerprint;
    await session.save();

    return {
      accessToken: this.sessionTokenService.issueAccessToken({
        sub: session.userId,
        principalType: 'USER',
        sessionId: session.id,
        sessionVersion: session.sessionVersion,
        authorizationVersion: authorizationContext.authorizationVersion,
        authorizationFingerprint: authorizationContext.authorizationFingerprint,
        sessionKind: session.sessionKind,
        readOnly: session.readOnly,
        activeOrganizationId: session.activeOrganizationId,
      }),
    };
  }
}
