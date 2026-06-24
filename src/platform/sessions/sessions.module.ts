import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityModule } from 'src/platform/identity/identity.module';
import { AccessTokenSessionValidator } from './access-token-session.validator';
import { AccessTokenStrategy } from './access-token.strategy';
import { AuthSession, AuthSessionSchema } from './auth-session.schema';
import { HumanSessionIssuerService } from './human-session-issuer.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionContextService } from './session-context.service';
import { SessionRefreshService } from './session-refresh.service';
import { SessionsService } from './sessions.service';
import { SessionTokenService } from './session-token.service';
import { TechnicalSessionIssuerService } from './technical-session-issuer.service';

@Module({
  imports: [
    JwtModule.register({}),
    IdentityModule,
    AccessControlModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
    ]),
  ],
  providers: [
    TransactionManagerService,
    SessionsService,
    SessionContextService,
    HumanSessionIssuerService,
    SessionRefreshService,
    TechnicalSessionIssuerService,
    SessionTokenService,
    AccessTokenSessionValidator,
    AccessTokenStrategy,
    JwtAuthGuard,
  ],
  exports: [
    SessionsService,
    SessionContextService,
    TechnicalSessionIssuerService,
    SessionTokenService,
    JwtAuthGuard,
    AccessTokenSessionValidator,
  ],
})
export class SessionsModule {}
