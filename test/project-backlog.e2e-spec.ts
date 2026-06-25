import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
} from './app-test-context';
import {
  copyBacklogSourceFields,
  createActiveBacklogRoadmap,
} from './helpers/project-roadmap-flow';

describe('Project backlog', () => {
  it('imports candidates from active roadmap and manages backlog items', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'project-backlog');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'project-backlog',
      );

      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/preview`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(409);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-no-roadmap-commit')
        .send({ previewToken: 'backlog-import-missing-roadmap' })
        .expect(409);

      const activeRoadmap = await createActiveBacklogRoadmap(
        context,
        ownerAccessToken,
        fixtures.projectId,
      );
      const preview = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/preview`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
      expect(preview.body.summary.candidates).toBe(2);
      expect(preview.body.summary.willCreate).toBe(2);
      expect(preview.body.candidates[0].traceability.roadmapId).toBe(
        activeRoadmap.id,
      );

      const beforeCommit = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(beforeCommit.body.items).toHaveLength(0);

      const committed = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-import-commit')
        .send({ previewToken: preview.body.previewToken as string })
        .expect(201);
      expect(committed.body.summary.created).toBe(2);
      expect(committed.body.items).toHaveLength(2);
      expect(committed.body.items[0].status).toBe('UNREFINED');
      expect(committed.body.items[0].traceability.snapshotId).toBe(
        activeRoadmap.activeVersion.snapshotId,
      );

      const repeatedSameKey = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-import-commit')
        .send({ previewToken: preview.body.previewToken as string })
        .expect(201);
      expect(repeatedSameKey.body.items).toHaveLength(2);

      const repeatedDifferentKey = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-import-commit-again')
        .send({ previewToken: preview.body.previewToken as string })
        .expect(201);
      expect(repeatedDifferentKey.body.summary.created).toBe(0);
      expect(repeatedDifferentKey.body.summary.skipped).toBe(2);

      const listed = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(listed.body.items).toHaveLength(2);
      expect(listed.body.items[0].milestoneTitle).toBe('Base operativa');
      expect(listed.body.items[0].epicTitle).toBe('Experiencia base');

      const manual = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-manual-create')
        .send({
          ...copyBacklogSourceFields(listed.body.items[0]),
          title: 'Manual hardening task',
          description: 'Tarea manual vinculada al roadmap activo.',
          type: 'TASK',
          priority: 3,
          estimate: { unit: 'IDEAL_DAYS', value: 2 },
          acceptanceCriteria: ['Tarea visible'],
          order: 2,
        })
        .expect(201);
      expect(manual.body.type).toBe('TASK');

      const updated = await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${listed.body.items[0].id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: listed.body.items[0].version as number,
          priority: 5,
          estimate: { unit: 'POINTS', value: 13 },
          status: 'READY',
          title: 'Crear flujo base refinado',
        })
        .expect(200);
      expect(updated.body.status).toBe('READY');
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${listed.body.items[1].id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: 99, priority: 10 })
        .expect(409);
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${listed.body.items[1].id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: listed.body.items[1].version as number,
          status: 'SELECTED_FOR_SPRINT',
        })
        .expect(409);

      const readiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(readiness.body.status).toBe('BACKLOG_READY');
      expect(readiness.body.nextLevel).toBe('READY_TO_START');
      expect(readiness.body.status).not.toBe('READY_TO_START');

      const reorder = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog/reorder`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-reorder')
        .send({
          items: [
            {
              id: manual.body.id as string,
              order: 0,
              expectedVersion: manual.body.version as number,
            },
            {
              id: updated.body.id as string,
              order: 1,
              expectedVersion: updated.body.version as number,
            },
            {
              id: listed.body.items[1].id as string,
              order: 2,
              expectedVersion: listed.body.items[1].version as number,
            },
          ],
        })
        .expect(201);
      expect(reorder.body.items[0].id).toBe(manual.body.id);
      const reorderedSecondImported = reorder.body.items.find(
        (item: { id: string }) => item.id === listed.body.items[1].id,
      );

      const archived = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/${listed.body.items[1].id as string}/archive`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: reorderedSecondImported.version as number })
        .expect(201);
      expect(archived.body.status).toBe('ARCHIVED');
      const activeList = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        activeList.body.items.some(
          (item: { id: string }) => item.id === archived.body.id,
        ),
      ).toBe(false);
      const withArchived = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/backlog?includeArchived=true`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        withArchived.body.items.some(
          (item: { id: string }) => item.id === archived.body.id,
        ),
      ).toBe(true);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'project-backlog-cross-org',
      );
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/preview`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-cross-commit')
        .send({ previewToken: preview.body.previewToken as string })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-cross-create')
        .send({
          ...copyBacklogSourceFields(listed.body.items[0]),
          title: 'Cross org',
          type: 'TASK',
          priority: 1,
          estimate: { unit: 'POINTS', value: 1 },
        })
        .expect(403);
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${updated.body.id as string}`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ expectedVersion: updated.body.version as number, priority: 1 })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog/reorder`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .set('Idempotency-Key', 'backlog-cross-reorder')
        .send({
          items: [
            {
              id: updated.body.id as string,
              order: 0,
              expectedVersion: updated.body.version as number,
            },
          ],
        })
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/${updated.body.id as string}/archive`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ expectedVersion: updated.body.version as number })
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
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/import-from-roadmap/commit`,
        )
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Idempotency-Key', 'backlog-readonly-commit')
        .send({ previewToken: preview.body.previewToken as string })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog`)
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Idempotency-Key', 'backlog-readonly-create')
        .send({
          ...copyBacklogSourceFields(listed.body.items[0]),
          title: 'Read only',
          type: 'TASK',
          priority: 1,
          estimate: { unit: 'POINTS', value: 1 },
        })
        .expect(403);
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/backlog/${updated.body.id as string}`,
        )
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ expectedVersion: updated.body.version as number, priority: 1 })
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/backlog/reorder`)
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .set('Idempotency-Key', 'backlog-readonly-reorder')
        .send({
          items: [
            {
              id: updated.body.id as string,
              order: 0,
              expectedVersion: updated.body.version as number,
            },
          ],
        })
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/backlog/${updated.body.id as string}/archive`,
        )
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ expectedVersion: updated.body.version as number })
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
    } finally {
      await context.close();
    }
  });
});
