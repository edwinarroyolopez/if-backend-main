import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { SessionsModule } from 'src/platform/sessions/sessions.module';
import { SERVICE_PRINCIPAL_LOOKUP } from 'src/platform/sessions/service-principal-lookup.port';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ServiceAccount, ServiceAccountSchema } from './service-account.schema';
import {
  ServiceCredential,
  ServiceCredentialSchema,
} from './service-credential.schema';

@Global()
@Module({
  imports: [
    ConfigModule,
    AccessControlModule,
    AuditModule,
    SessionsModule,
    MongooseModule.forFeature([
      { name: ServiceAccount.name, schema: ServiceAccountSchema },
      { name: ServiceCredential.name, schema: ServiceCredentialSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    TransactionManagerService,
    {
      provide: SERVICE_PRINCIPAL_LOOKUP,
      useExisting: IntegrationsService,
    },
  ],
  exports: [IntegrationsService, SERVICE_PRINCIPAL_LOOKUP],
})
export class IntegrationsModule {}
