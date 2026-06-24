import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import request, { Response } from 'supertest';
import {
  AccessPolicy,
  AccessPolicyDocument,
} from 'src/platform/access-control/access-policy.schema';
import { Role, RoleDocument } from 'src/platform/access-control/role.schema';
import { AuditLog, AuditLogDocument } from 'src/platform/audit/audit.schema';
import {
  OutboxEvent,
  OutboxEventDocument,
} from 'src/platform/events/outbox-event.schema';
import { OutboxRelayService } from 'src/platform/events/outbox-relay.service';
import { configureApp } from 'src/platform/http/configure-app';
import {
  ServiceAccount,
  ServiceAccountDocument,
} from 'src/modules/integrations/service-account.schema';
import {
  ServiceCredential,
  ServiceCredentialDocument,
} from 'src/modules/integrations/service-credential.schema';
import { User, UserDocument } from 'src/platform/identity/user.schema';
import {
  AuthSession,
  AuthSessionDocument,
} from 'src/platform/sessions/auth-session.schema';
import {
  MediaBatch,
  MediaBatchDocument,
} from 'src/modules/image-ops/media-batch.schema';
import { applyTestEnvironment, startMongoReplSet } from './mongo-replset';

type TestModels = {
  users: Model<UserDocument>;
  accessPolicies: Model<AccessPolicyDocument>;
  roles: Model<RoleDocument>;
  outbox: Model<OutboxEventDocument>;
  auditLogs: Model<AuditLogDocument>;
  mediaBatches: Model<MediaBatchDocument>;
  serviceAccounts: Model<ServiceAccountDocument>;
  serviceCredentials: Model<ServiceCredentialDocument>;
  authSessions: Model<AuthSessionDocument>;
};

export type TestContext = {
  app: INestApplication;
  mongo: Awaited<ReturnType<typeof startMongoReplSet>>;
  http: ReturnType<typeof request>;
  agent: ReturnType<typeof request.agent>;
  models: TestModels;
  drainOutboxOnce(): Promise<number>;
  drainOutboxUntilIdle(maxIterations?: number): Promise<number>;
  close(): Promise<void>;
};

export async function createTestContext(): Promise<TestContext> {
  const mongo = await startMongoReplSet();
  applyTestEnvironment(mongo.uri);
  const { AppModule } = await import('src/app.module');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app, app.get(ConfigService));
  await app.init();
  const outboxRelayService = app.get(OutboxRelayService);

  return {
    app,
    mongo,
    http: request(app.getHttpServer()),
    agent: request.agent(app.getHttpServer()),
    models: getModels(app),
    async drainOutboxOnce() {
      return outboxRelayService.drainOnce();
    },
    async drainOutboxUntilIdle(maxIterations = 10) {
      let processed = 0;
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const current = await outboxRelayService.drainOnce();
        processed += current;
        if (current === 0) {
          break;
        }
      }

      return processed;
    },
    async close() {
      await app.close();
      await mongo.stop();
    },
  };
}

function getModels(app: INestApplication): TestModels {
  return {
    users: app.get<Model<UserDocument>>(getModelToken(User.name)),
    accessPolicies: app.get<Model<AccessPolicyDocument>>(
      getModelToken(AccessPolicy.name),
    ),
    roles: app.get<Model<RoleDocument>>(getModelToken(Role.name)),
    outbox: app.get<Model<OutboxEventDocument>>(
      getModelToken(OutboxEvent.name),
    ),
    auditLogs: app.get<Model<AuditLogDocument>>(getModelToken(AuditLog.name)),
    mediaBatches: app.get<Model<MediaBatchDocument>>(
      getModelToken(MediaBatch.name),
    ),
    serviceAccounts: app.get<Model<ServiceAccountDocument>>(
      getModelToken(ServiceAccount.name),
    ),
    serviceCredentials: app.get<Model<ServiceCredentialDocument>>(
      getModelToken(ServiceCredential.name),
    ),
    authSessions: app.get<Model<AuthSessionDocument>>(
      getModelToken(AuthSession.name),
    ),
  };
}

export async function registerAndBootstrapOrganization(
  context: TestContext,
  uniqueSeed = Date.now().toString(),
) {
  const registerResponse = await context.agent
    .post('/api/v1/auth/web/register')
    .send({
      email: `owner-${uniqueSeed}@test.dev`,
      displayName: 'Owner User',
      password: 'OwnerPassword123!',
    })
    .expect(201);
  const bootstrapResponse = await context.agent
    .post('/api/v1/organizations/bootstrap')
    .set(
      'Authorization',
      `Bearer ${registerResponse.body.accessToken as string}`,
    )
    .send({ key: `org-${uniqueSeed}`, name: `Org ${uniqueSeed}` })
    .expect(201);

  return {
    ownerAccessToken: bootstrapResponse.body.accessToken as string,
    organizationId: bootstrapResponse.body.id as string,
    ownerEmail: registerResponse.body.user.email as string,
  };
}

export async function createOperationalFixtures(
  context: TestContext,
  accessToken: string,
  organizationId: string,
  uniqueSeed = Date.now().toString(),
) {
  const clientResponse = await context.http
    .post('/api/v1/clients')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      organizationId,
      key: `client-${uniqueSeed}`,
      name: `Client ${uniqueSeed}`,
    })
    .expect(201);
  const projectResponse = await context.http
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      organizationId,
      clientId: clientResponse.body.id as string,
      key: `project-${uniqueSeed}`,
      name: `Project ${uniqueSeed}`,
    })
    .expect(201);
  const missionResponse = await context.http
    .post('/api/v1/missions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      organizationId,
      projectId: projectResponse.body.id as string,
      key: `mission-${uniqueSeed}`,
      name: `Mission ${uniqueSeed}`,
      status: 'READY',
    })
    .expect(201);

  return {
    clientId: clientResponse.body.id as string,
    projectId: projectResponse.body.id as string,
    missionId: missionResponse.body.id as string,
  };
}

export async function registerNativeUser(
  context: TestContext,
  input: { email: string; displayName: string; password: string },
) {
  return context.http
    .post('/api/v1/auth/native/register')
    .send(input)
    .expect(201);
}

export async function loginNativeUser(
  context: TestContext,
  input: { email: string; password: string; activeOrganizationId?: string },
): Promise<Response> {
  return context.http.post('/api/v1/auth/native/login').send(input).expect(201);
}
