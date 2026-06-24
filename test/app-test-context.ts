import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { OutboxEventDocument } from 'src/platform/events/outbox-event.schema';
import { AuditLogDocument } from 'src/platform/audit/audit.schema';
import { RoleDocument } from 'src/platform/access-control/role.schema';
import { UserDocument, User } from 'src/platform/identity/user.schema';
import { configureApp } from 'src/platform/http/configure-app';
import { MediaBatchDocument, MediaBatch } from 'src/modules/image-ops/media-batch.schema';
import { OutboxEvent } from 'src/platform/events/outbox-event.schema';
import { AuditLog } from 'src/platform/audit/audit.schema';
import { Role } from 'src/platform/access-control/role.schema';
import { ServiceCredential, ServiceCredentialDocument } from 'src/modules/integrations/service-credential.schema';
import { ServiceAccount, ServiceAccountDocument } from 'src/modules/integrations/service-account.schema';
import { applyTestEnvironment, startMongoReplSet } from './mongo-replset';

type TestModels = {
  users: { findById(id: string): Promise<UserDocument | null>; updateOne(filter: object, update: object): Promise<unknown> };
  roles: { findOne(filter: object): Promise<RoleDocument | null> };
  outbox: { find(filter?: object): Promise<OutboxEventDocument[]> };
  auditLogs: { find(filter?: object): Promise<AuditLogDocument[]> };
  mediaBatches: { find(filter?: object): Promise<MediaBatchDocument[]> };
  serviceAccounts: { findOne(filter: object): Promise<ServiceAccountDocument | null> };
  serviceCredentials: { findOne(filter: object): Promise<ServiceCredentialDocument | null> };
};

export async function createTestContext() {
  const mongo = await startMongoReplSet();
  applyTestEnvironment(mongo.uri);
  const { AppModule } = await import('src/app.module');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app, app.get(ConfigService));
  await app.init();

  return {
    app,
    mongo,
    http: request(app.getHttpServer()),
    agent: request.agent(app.getHttpServer()),
    models: getModels(app),
    async close() {
      await app.close();
      await mongo.stop();
    },
  };
}

function getModels(app: INestApplication): TestModels {
  return {
    users: app.get(getModelToken(User.name)),
    roles: app.get(getModelToken(Role.name)),
    outbox: app.get(getModelToken(OutboxEvent.name)),
    auditLogs: app.get(getModelToken(AuditLog.name)),
    mediaBatches: app.get(getModelToken(MediaBatch.name)),
    serviceAccounts: app.get(getModelToken(ServiceAccount.name)),
    serviceCredentials: app.get(getModelToken(ServiceCredential.name)),
  };
}

export async function registerAndBootstrapOrganization(context: Awaited<ReturnType<typeof createTestContext>>) {
  const unique = Date.now().toString();
  const registerResponse = await context.agent.post('/api/v1/auth/web/register').send({
    email: `owner-${unique}@test.dev`,
    displayName: 'Owner User',
    password: 'OwnerPassword123!',
  });
  const bootstrapResponse = await context.agent
    .post('/api/v1/organizations/bootstrap')
    .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
    .send({ key: `org-${unique}`, name: `Org ${unique}` });

  return {
    ownerAccessToken: bootstrapResponse.body.accessToken as string,
    organizationId: bootstrapResponse.body.id as string,
    ownerEmail: registerResponse.body.user.email as string,
  };
}

export async function createOperationalFixtures(
  context: Awaited<ReturnType<typeof createTestContext>>,
  accessToken: string,
  organizationId: string,
) {
  const clientResponse = await context.http.post('/api/v1/clients').set('Authorization', `Bearer ${accessToken}`).send({
    organizationId,
    key: 'client-main',
    name: 'Main Client',
  });
  const projectResponse = await context.http.post('/api/v1/projects').set('Authorization', `Bearer ${accessToken}`).send({
    organizationId,
    clientId: clientResponse.body.id,
    key: 'project-main',
    name: 'Main Project',
  });
  const missionResponse = await context.http.post('/api/v1/missions').set('Authorization', `Bearer ${accessToken}`).send({
    organizationId,
    projectId: projectResponse.body.id,
    key: 'mission-main',
    name: 'Main Mission',
    status: 'READY',
  });

  return {
    clientId: clientResponse.body.id as string,
    projectId: projectResponse.body.id as string,
    missionId: missionResponse.body.id as string,
  };
}
