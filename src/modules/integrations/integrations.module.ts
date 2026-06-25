import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { SessionsModule } from 'src/platform/sessions/sessions.module';
import { SERVICE_PRINCIPAL_LOOKUP } from 'src/platform/sessions/service-principal-lookup.port';
import { ProjectsModule } from 'src/modules/projects/projects.module';
import { IfConnectorsRuntimeClient } from './if-connectors-runtime.client';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ProjectConnectorMirrorsController } from './project-connector-mirrors.controller';
import { ProjectConnectorMirrorsService } from './project-connector-mirrors.service';
import {
  ProjectConnectorMirror,
  ProjectConnectorMirrorSchema,
} from './project-connector-mirror.schema';
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
    ProjectsModule,
    SessionsModule,
    MongooseModule.forFeature([
      {
        name: ProjectConnectorMirror.name,
        schema: ProjectConnectorMirrorSchema,
      },
      { name: ServiceAccount.name, schema: ServiceAccountSchema },
      { name: ServiceCredential.name, schema: ServiceCredentialSchema },
    ]),
  ],
  controllers: [IntegrationsController, ProjectConnectorMirrorsController],
  providers: [
    IntegrationsService,
    ProjectConnectorMirrorsService,
    IfConnectorsRuntimeClient,
    TransactionManagerService,
    {
      provide: SERVICE_PRINCIPAL_LOOKUP,
      useExisting: IntegrationsService,
    },
  ],
  exports: [IntegrationsService, SERVICE_PRINCIPAL_LOOKUP],
})
export class IntegrationsModule {}
