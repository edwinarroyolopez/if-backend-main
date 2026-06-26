import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
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
import {
  ProjectConnectorMirror,
  ProjectConnectorMirrorDocument,
} from 'src/modules/integrations/project-connector-mirror.schema';
import { User, UserDocument } from 'src/platform/identity/user.schema';
import {
  AuthSession,
  AuthSessionDocument,
} from 'src/platform/sessions/auth-session.schema';
import {
  MediaBatch,
  MediaBatchDocument,
} from 'src/modules/image-ops/media-batch.schema';
import {
  MissionMediaAsset,
  MissionMediaAssetDocument,
} from 'src/modules/flight-ops/mission-media-asset.schema';
import { applyTestEnvironment, startMongoReplSet } from './mongo-replset';

type TestModels = {
  users: HydratedModel<UserDocument>;
  accessPolicies: HydratedModel<AccessPolicyDocument>;
  roles: HydratedModel<RoleDocument>;
  outbox: HydratedModel<OutboxEventDocument>;
  auditLogs: HydratedModel<AuditLogDocument>;
  mediaBatches: HydratedModel<MediaBatchDocument>;
  missionMediaAssets: HydratedModel<MissionMediaAssetDocument>;
  serviceAccounts: HydratedModel<ServiceAccountDocument>;
  serviceCredentials: HydratedModel<ServiceCredentialDocument>;
  projectConnectorMirrors: HydratedModel<ProjectConnectorMirrorDocument>;
  authSessions: HydratedModel<AuthSessionDocument>;
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
    users: app.get<HydratedModel<UserDocument>>(getModelToken(User.name)),
    accessPolicies: app.get<HydratedModel<AccessPolicyDocument>>(
      getModelToken(AccessPolicy.name),
    ),
    roles: app.get<HydratedModel<RoleDocument>>(getModelToken(Role.name)),
    outbox: app.get<HydratedModel<OutboxEventDocument>>(
      getModelToken(OutboxEvent.name),
    ),
    auditLogs: app.get<HydratedModel<AuditLogDocument>>(
      getModelToken(AuditLog.name),
    ),
    mediaBatches: app.get<HydratedModel<MediaBatchDocument>>(
      getModelToken(MediaBatch.name),
    ),
    missionMediaAssets: app.get<HydratedModel<MissionMediaAssetDocument>>(
      getModelToken(MissionMediaAsset.name),
    ),
    serviceAccounts: app.get<HydratedModel<ServiceAccountDocument>>(
      getModelToken(ServiceAccount.name),
    ),
    serviceCredentials: app.get<HydratedModel<ServiceCredentialDocument>>(
      getModelToken(ServiceCredential.name),
    ),
    projectConnectorMirrors: app.get<
      HydratedModel<ProjectConnectorMirrorDocument>
    >(getModelToken(ProjectConnectorMirror.name)),
    authSessions: app.get<HydratedModel<AuthSessionDocument>>(
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
    .set('Idempotency-Key', `project-create-${uniqueSeed}`)
    .send({
      organizationId,
      projectKind: 'CLIENT',
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
      buildingName: `Building ${uniqueSeed}`,
      address: `${uniqueSeed} Test Street`,
      scheduledWindow: {
        startsAt: new Date(Date.now() + 60_000).toISOString(),
      },
    })
    .expect(201);

  return {
    clientId: clientResponse.body.id as string,
    projectId: projectResponse.body.id as string,
    missionId: missionResponse.body.id as string,
  };
}

export async function prepareMissionForPilotCompletion(
  context: TestContext,
  input: {
    accessToken: string;
    ownerEmail: string;
    missionId: string;
    organizationId: string;
    seed: string;
  },
) {
  const owner = await context.models.users.findOne({ email: input.ownerEmail });
  if (!owner) {
    throw new Error(`Test owner not found: ${input.ownerEmail}`);
  }

  await context.http
    .post(`/api/v1/missions/${input.missionId}/assign`)
    .set('Authorization', `Bearer ${input.accessToken}`)
    .set('Idempotency-Key', `assign-${input.seed}`)
    .send({ assignedPilotId: owner.id })
    .expect(201);
  await context.http
    .post(`/api/v1/missions/${input.missionId}/accept`)
    .set('Authorization', `Bearer ${input.accessToken}`)
    .set('Idempotency-Key', `accept-${input.seed}`)
    .expect(201);
  await context.http
    .post(`/api/v1/missions/${input.missionId}/start`)
    .set('Authorization', `Bearer ${input.accessToken}`)
    .set('Idempotency-Key', `start-${input.seed}`)
    .expect(201);

  await context.models.missionMediaAssets.create({
    organizationId: input.organizationId,
    missionId: input.missionId,
    cloudinaryPublicId: `test/${input.missionId}/${input.seed}`,
    secureUrl: `https://res.cloudinary.com/test/image/upload/${input.seed}`,
    resourceType: 'image',
    originalFilename: 'mission-evidence.jpg',
    uploadedBy: owner.id,
    uploadedAt: new Date(),
  });

  await context.drainOutboxUntilIdle();
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
