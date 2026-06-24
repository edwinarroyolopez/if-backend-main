import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsModule } from 'src/modules/integrations/integrations.module';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityModule } from 'src/platform/identity/identity.module';
import { AccessTokenSessionValidator } from './access-token-session.validator';
import { AccessTokenStrategy } from './access-token.strategy';
import { AuthSession, AuthSessionSchema } from './auth-session.schema';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { SessionTokenService } from './session-token.service';

@Module({
  imports: [
    JwtModule.register({}),
    IdentityModule,
    IntegrationsModule,
    AccessControlModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
    ]),
  ],
  providers: [
    TransactionManagerService,
    SessionsService,
    SessionTokenService,
    AccessTokenSessionValidator,
    AccessTokenStrategy,
    JwtAuthGuard,
  ],
  exports: [
    SessionsService,
    SessionTokenService,
    JwtAuthGuard,
    AccessTokenSessionValidator,
  ],
})
export class SessionsModule {}
