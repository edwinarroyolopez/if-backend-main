import { Module } from '@nestjs/common';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { SessionsModule } from 'src/platform/sessions/sessions.module';
import { AuthController } from './auth.controller';
import { NativeAuthController } from './native-auth.controller';
import { WebAuthController } from './web-auth.controller';

@Module({
  imports: [SessionsModule, AccessControlModule],
  controllers: [WebAuthController, NativeAuthController, AuthController],
})
export class AuthHttpModule {}
