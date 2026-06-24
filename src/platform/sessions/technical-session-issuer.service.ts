import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class TechnicalSessionIssuerService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async issueServiceAccountSession(input: {
    serviceAccountId: string;
    sessionVersion: number;
    authorizationVersion: number;
    authorizationFingerprint: string;
    activeOrganizationId: string;
    session?: ClientSession;
  }): Promise<{ accessToken: string; sessionId: string }> {
    const sessionId = randomUUID();
    await this.authSessionModel.create(
      [
        {
          _id: sessionId,
          principalType: 'SERVICE_ACCOUNT',
          serviceAccountId: input.serviceAccountId,
          sessionKind: 'SERVICE_ACCOUNT',
          sessionVersion: input.sessionVersion,
          authorizationVersion: input.authorizationVersion,
          authorizationFingerprint: input.authorizationFingerprint,
          expiresAt: new Date(
            Date.now() + this.sessionTokenService.getAccessTtlMs(),
          ),
          readOnly: false,
          activeOrganizationId: input.activeOrganizationId,
        },
      ],
      input.session ? { session: input.session } : undefined,
    );

    return {
      accessToken: this.sessionTokenService.issueAccessToken({
        sub: input.serviceAccountId,
        principalType: 'SERVICE_ACCOUNT',
        sessionId,
        sessionVersion: input.sessionVersion,
        authorizationVersion: input.authorizationVersion,
        authorizationFingerprint: input.authorizationFingerprint,
        sessionKind: 'SERVICE_ACCOUNT',
        readOnly: false,
        activeOrganizationId: input.activeOrganizationId,
      }),
      sessionId,
    };
  }

  async revokeServiceAccountSessions(
    serviceAccountId: string,
    reason: string,
    session: ClientSession,
  ): Promise<void> {
    await this.authSessionModel.updateMany(
      {
        principalType: 'SERVICE_ACCOUNT',
        serviceAccountId,
        revokedAt: { $exists: false },
      },
      {
        $set: {
          revokedAt: new Date(),
          revokeReason: reason,
        },
      },
      { session },
    );
  }
}
