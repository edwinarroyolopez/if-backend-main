import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Credential, CredentialSchema } from './credential.schema';
import { IdentityService } from './identity.service';
import { PasswordHasherService } from './password-hasher.service';
import { User, UserSchema } from './user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Credential.name, schema: CredentialSchema },
    ]),
  ],
  providers: [IdentityService, PasswordHasherService],
  exports: [IdentityService],
})
export class IdentityModule {}
