import {
  loginNativeUser,
  registerAndBootstrapOrganization,
  type TestContext,
} from '../app-test-context';

export async function expectRoadmapImportAccessRestrictions(input: {
  context: TestContext;
  ownerEmail: string;
  organizationId: string;
  projectId: string;
  roadmapId: string;
  snapshotId: string;
  roadmapImport: Record<string, unknown>;
  previewToken: string;
}) {
  const {
    context,
    ownerEmail,
    organizationId,
    projectId,
    roadmapId,
    snapshotId,
    roadmapImport,
    previewToken,
  } = input;
  const secondOrg = await registerAndBootstrapOrganization(
    context,
    'roadmap-imports-cross-org',
  );
  await context.http
    .get(`/api/v1/projects/${projectId}/roadmaps`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .get(`/api/v1/projects/${projectId}/roadmaps/${roadmapId}`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/prompts/roadmap`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ snapshotId })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/preview`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .send({ roadmapImport })
    .expect(403);
  await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/commit`)
    .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
    .set('Idempotency-Key', 'roadmap-cross-org-commit')
    .send({ roadmapImport, previewToken })
    .expect(403);
  for (const action of ['activate', 'archive']) {
    await context.http
      .post(`/api/v1/projects/${projectId}/roadmaps/${roadmapId}/${action}`)
      .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
      .expect(403);
  }

  const readOnlyLogin = await loginNativeUser(context, {
    email: ownerEmail,
    password: 'OwnerPassword123!',
    activeOrganizationId: organizationId,
  });
  await context.models.authSessions.updateOne(
    { _id: readOnlyLogin.body.sessionId as string },
    { $set: { readOnly: true } },
  );
  await context.http
    .post(`/api/v1/projects/${projectId}/roadmap-imports/commit`)
    .set('Authorization', `Bearer ${readOnlyLogin.body.accessToken as string}`)
    .set('Idempotency-Key', 'roadmap-readonly-commit')
    .send({ roadmapImport, previewToken })
    .expect(403);
  for (const action of ['activate', 'archive']) {
    await context.http
      .post(`/api/v1/projects/${projectId}/roadmaps/${roadmapId}/${action}`)
      .set(
        'Authorization',
        `Bearer ${readOnlyLogin.body.accessToken as string}`,
      )
      .expect(403);
  }
}

export async function expectRoadmapImportAudits(input: {
  context: TestContext;
  organizationId: string;
  roadmapId: string;
}) {
  const { context, organizationId, roadmapId } = input;
  for (const action of [
    'projects.roadmap.activate',
    'projects.roadmap.import_commit',
    'projects.roadmap.archive',
  ]) {
    const audit = await context.models.auditLogs.findOne({
      organizationId,
      action,
      resourceId: roadmapId,
    });
    expect(audit).toBeTruthy();
  }
}
