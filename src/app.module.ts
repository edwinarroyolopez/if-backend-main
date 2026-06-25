import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import path from 'node:path';
import { buildAppConfig } from 'src/platform/config/app-config';
import { HttpPlatformModule } from 'src/platform/http/http.module';
import { RequestContextMiddleware } from 'src/platform/http/request-context.middleware';
import { HealthModule } from 'src/platform/health/health.module';
import { AuditModule } from 'src/platform/audit/audit.module';
import { EventsModule } from 'src/platform/events/events.module';
import { IdempotencyModule } from 'src/platform/idempotency/idempotency.module';
import { IdentityModule } from 'src/platform/identity/identity.module';
import { SessionsModule } from 'src/platform/sessions/sessions.module';
import { AuthHttpModule } from 'src/platform/auth-http/auth-http.module';
import { AccessControlModule } from 'src/platform/access-control/access-control.module';
import { NotificationsModule } from 'src/platform/notifications/notifications.module';
import { RealtimeModule } from 'src/platform/realtime/realtime.module';
import { OrganizationsModule } from 'src/modules/organizations/organizations.module';
import { CrmModule } from 'src/modules/crm/crm.module';
import { SalesModule } from 'src/modules/sales/sales.module';
import { ProjectsModule } from 'src/modules/projects/projects.module';
import { FlightOpsModule } from 'src/modules/flight-ops/flight-ops.module';
import { ImageOpsModule } from 'src/modules/image-ops/image-ops.module';
import { DeliverablesModule } from 'src/modules/deliverables/deliverables.module';
import { FinanceModule } from 'src/modules/finance/finance.module';
import { IntegrationsModule } from 'src/modules/integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [buildAppConfig],
      envFilePath: [
        path.resolve(__dirname, '..', '.env.local'),
        path.resolve(__dirname, '..', '.env'),
      ],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    JwtModule.register({}),
    HttpPlatformModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('app.mongodbUri'),
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      }),
    }),
    HealthModule,
    AuditModule,
    EventsModule,
    IdempotencyModule,
    IdentityModule,
    AccessControlModule,
    RealtimeModule,
    NotificationsModule,
    SessionsModule,
    AuthHttpModule,
    OrganizationsModule,
    CrmModule,
    SalesModule,
    ProjectsModule,
    FlightOpsModule,
    ImageOpsModule,
    DeliverablesModule,
    FinanceModule,
    IntegrationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
