import { ClientSession, Model } from 'mongoose';
import { CredentialDocument } from 'src/platform/identity/credential.schema';
import { PasswordHasherService } from 'src/platform/identity/password-hasher.service';

export async function setActivePasswordCredential(
  credentialModel: Model<CredentialDocument>,
  passwordHasherService: PasswordHasherService,
  userId: string,
  password: string,
  session: ClientSession,
) {
  const passwordHash = await passwordHasherService.hash(password);
  await credentialModel.updateMany(
    {
      principalId: userId,
      type: 'PASSWORD',
      status: 'ACTIVE',
    },
    { $set: { status: 'REVOKED', rotatedAt: new Date() } },
    { session },
  );
  await credentialModel.create(
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
