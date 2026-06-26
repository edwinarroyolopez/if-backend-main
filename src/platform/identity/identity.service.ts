import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession } from 'mongoose';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { normalizeEmail } from 'src/common/utils/hash.util';
import { Credential, CredentialDocument } from './credential.schema';
import { PasswordHasherService } from './password-hasher.service';
import { User, UserDocument } from './user.schema';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  sessionVersion: number;
  authorizationVersion: number;
};

@Injectable()
export class IdentityService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: HydratedModel<UserDocument>,
    @InjectModel(Credential.name)
    private readonly credentialModel: HydratedModel<CredentialDocument>,
    private readonly passwordHasherService: PasswordHasherService,
  ) {}

  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      sessionVersion: user.sessionVersion,
      authorizationVersion: user.authorizationVersion,
    };
  }

  async registerUser(
    input: { email: string; displayName: string; password: string },
    session: ClientSession,
  ): Promise<UserDocument> {
    this.passwordHasherService.enforcePolicy(input.password);
    const normalizedEmail = normalizeEmail(input.email);
    const existingUser = await this.userModel
      .findOne({ normalizedEmail })
      .session(session);
    if (existingUser) {
      throw new AppException(
        409,
        REASON_CODES.VALIDATION_FAILED,
        'User email already exists',
      );
    }

    const passwordHash = await this.passwordHasherService.hash(input.password);
    const [user] = await this.userModel.create(
      [
        {
          email: input.email.trim(),
          normalizedEmail,
          displayName: input.displayName.trim(),
          status: 'ACTIVE',
          sessionVersion: 0,
          authorizationVersion: 0,
        },
      ],
      { session },
    );

    await this.credentialModel.create(
      [
        {
          principalId: user.id,
          type: 'PASSWORD',
          passwordHash,
          status: 'ACTIVE',
        },
      ],
      { session },
    );

    return user;
  }

  async authenticatePassword(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.userModel.findOne({ normalizedEmail });
    if (!user || user.status !== 'ACTIVE') {
      await this.passwordHasherService.verifyAgainstDummyHash(password);
      throw new AppException(
        401,
        REASON_CODES.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    const credential = await this.credentialModel
      .findOne({ principalId: user.id, type: 'PASSWORD', status: 'ACTIVE' })
      .select('+passwordHash');

    if (!credential?.passwordHash) {
      await this.passwordHasherService.verifyAgainstDummyHash(password);
      throw new AppException(
        401,
        REASON_CODES.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    const matches = await this.passwordHasherService.verify(
      credential.passwordHash,
      password,
    );
    if (!matches) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    return user;
  }

  async findUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId);
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ normalizedEmail: normalizeEmail(email) });
  }

  async listUsersByIds(userIds: string[]): Promise<UserDocument[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.userModel
      .find({ _id: { $in: [...new Set(userIds)] } })
      .sort({ displayName: 1, email: 1 });
  }

  async ensureActivePasswordCredential(
    userId: string,
    password: string,
    session: ClientSession,
  ) {
    this.passwordHasherService.enforcePolicy(password);
    const passwordHash = await this.passwordHasherService.hash(password);

    await this.credentialModel.updateMany(
      { principalId: userId, type: 'PASSWORD', status: 'ACTIVE' },
      { $set: { status: 'REVOKED', rotatedAt: new Date() } },
      { session },
    );
    await this.credentialModel.create(
      [
        {
          principalId: userId,
          type: 'PASSWORD',
          passwordHash,
          status: 'ACTIVE',
          rotatedAt: new Date(),
        },
      ],
      { session },
    );
  }

  async bumpSessionVersion(
    userId: string,
    session: ClientSession,
  ): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { sessionVersion: 1 } },
      { new: true, session },
    );
  }

  async bumpAuthorizationVersion(
    userId: string,
    session: ClientSession,
  ): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { authorizationVersion: 1 } },
      { new: true, session },
    );
  }
}
