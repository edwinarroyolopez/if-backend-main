import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthSession, AuthSessionDocument } from './auth-session.schema';

@Injectable()
export class SessionContextService {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
  ) {}

  async setActiveOrganizationForHumanSession(
    sessionId: string,
    userId: string,
    organizationId: string,
    session: ClientSession,
  ): Promise<void> {
    const updatedSession = await this.authSessionModel.updateOne(
      {
        _id: sessionId,
        principalType: 'USER',
        userId,
        revokedAt: { $exists: false },
      },
      { $set: { activeOrganizationId: organizationId } },
      { session },
    );
    if (updatedSession.matchedCount === 0) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_SESSION_REVOKED,
        'Session was not found',
      );
    }
  }
}
