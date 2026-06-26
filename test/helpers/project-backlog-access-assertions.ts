import {
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from '../app-test-context';
import { copyBacklogSourceFields } from './project-roadmap-flow';

export async function expectBacklogAccessRestrictions(input: {
  context: Awaited<ReturnType<typeof createTestContext>>;
  ownerEmail: string;
  ownerAccessToken: string;
  organizationId: string;
  projectId: string;
  previewToken: string;
  sourceItem: Record<string, unknown>;
  updatedItem: { id: string; version: number };
}) {
  const {
    context,
    ownerEmail,
    ownerAccessToken,
    organizationId,
    projectId,
    previewToken,
    sourceItem,
    updatedItem,
  } = input;
  const secondOrg = await registerAndBootstrapOrganization(
    context,
    'project-backlog-cross-org',
  );
  await context.http
    .get(`/api/v1/projects/${projectId}/backlog`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/import-from-roadmap/preview`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/import-from-roadmap/commit`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'backlog-cross-commit')
    .send({ previewToken })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'backlog-cross-create')
    .send({
      ...copyBacklogSourceFields(sourceItem),
      title: 'Cross org',
      type: 'TASK',
      priority: 1,
      estimate: { unit: 'POINTS', value: 1 },
    })
    .expect(403);
  await context.http
    .patch(`/api/v1/projects/${projectId}/backlog/${updatedItem.id}`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ expectedVersion: updatedItem.version, priority: 1 })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/reorder`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'backlog-cross-reorder')
    .send({
      items: [
        { id: updatedItem.id, order: 0, expectedVersion: updatedItem.version },
      ],
    })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/${updatedItem.id}/archive`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ expectedVersion: updatedItem.version })
    .expect(403);

  const readOnlyLogin = await loginNativeUser(context, {
    email: ownerEmail,
    password: 'OwnerPassword123!',
    activeOrganizationId: organizationId,
  });
  await context.models.authSessions.updateOne(
    { _id: readOnlyLogin.body.sessionId as string },
    { $set: { readOnly: true } },
  );
  const readOnlyToken = readOnlyLogin.body.accessToken as string;
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/import-from-roadmap/commit`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'backlog-readonly-commit')
    .send({ previewToken })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'backlog-readonly-create')
    .send({
      ...copyBacklogSourceFields(sourceItem),
      title: 'Read only',
      type: 'TASK',
      priority: 1,
      estimate: { unit: 'POINTS', value: 1 },
    })
    .expect(403);
  await context.http
    .patch(`/api/v1/projects/${projectId}/backlog/${updatedItem.id}`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .send({ expectedVersion: updatedItem.version, priority: 1 })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/reorder`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .set('Idempotency-Key', 'backlog-readonly-reorder')
    .send({
      items: [
        { id: updatedItem.id, order: 0, expectedVersion: updatedItem.version },
      ],
    })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/backlog/${updatedItem.id}/archive`)
    .set('Authorization', `Bearer ${readOnlyToken}`)
    .send({ expectedVersion: updatedItem.version })
    .expect(403);
  for (const action of [
    'projects.backlog.import_commit',
    'projects.backlog.create',
    'projects.backlog.update',
    'projects.backlog.reorder',
    'projects.backlog.archive',
  ]) {
    const audit = await context.models.auditLogs.findOne({
      organizationId,
      action,
    });
    expect(audit).toBeTruthy();
  }
  expect(ownerAccessToken).toBeTruthy();
}
