import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import {
  AuthSession,
  AuthSessionSchema,
} from 'src/platform/sessions/auth-session.schema';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ServiceAccount, ServiceAccountSchema } from './service-account.schema';
import {
  ServiceCredential,
  ServiceCredentialSchema,
} from './service-credential.schema';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    AccessControlModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: ServiceAccount.name, schema: ServiceAccountSchema },
      { name: ServiceCredential.name, schema: ServiceCredentialSchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, TransactionManagerService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
