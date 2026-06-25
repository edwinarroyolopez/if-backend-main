import {
  createOperationalFixtures,
  createTestContext,
  loginNativeUser,
  registerAndBootstrapOrganization,
  registerNativeUser,
} from './app-test-context';
import { prepareReadyProject } from './helpers/project-team-readiness';

jest.setTimeout(50000);

describe('Project team and final readiness', () => {
  it('manages operational membership, readiness and team activity', async () => {
    const context = await createTestContext();
    try {
      const { ownerAccessToken, organizationId, ownerEmail } =
        await registerAndBootstrapOrganization(context, 'project-team');
      const fixtures = await createOperationalFixtures(
        context,
        ownerAccessToken,
        organizationId,
        'team-a',
      );
      const prepared = await prepareReadyProject(
        context,
        ownerAccessToken,
        fixtures.projectId,
      );

      const noTeamReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(noTeamReadiness.body.status).toBe('BACKLOG_READY');
      expect(noTeamReadiness.body.blockingReasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'MINIMUM_TEAM_AND_CAPACITY_REQUIRED',
          }),
        ]),
      );

      const activeMember = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-active-create')
        .send({
          displayName: 'Alice Delivery',
          email: 'alice.delivery@test.dev',
          role: 'PROJECT_LEAD',
          capacity: 32,
          status: 'ACTIVE',
        })
        .expect(201);
      expect(activeMember.body.capacityUnit).toBe('HOURS_PER_WEEK');
      expect(activeMember.body.status).toBe('ACTIVE');

      const plannedMember = await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-planned-create')
        .send({
          userId: 'external-bob',
          displayName: 'Bob Planned',
          email: 'bob.planned@test.dev',
          role: 'ENGINEER',
          capacity: 24,
          status: 'PLANNED',
        })
        .expect(201);
      expect(plannedMember.body.status).toBe('PLANNED');

      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-duplicate-active')
        .send({
          displayName: 'Alice Duplicate',
          email: 'ALICE.DELIVERY@test.dev',
          role: 'ENGINEER',
          capacity: 10,
          status: 'ACTIVE',
        })
        .expect(409);

      const team = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(team.body.items).toHaveLength(2);
      expect(team.body.activeCapacity).toBe(32);

      const readyReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(readyReadiness.body.status).toBe('READY_TO_START');
      expect(readyReadiness.body.completedSignals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MINIMUM_TEAM_READY' }),
          expect.objectContaining({ code: 'SCRUM_READY' }),
          expect.objectContaining({ code: 'CONTEXT_SNAPSHOT_READY' }),
        ]),
      );

      const updatedMember = await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/team/${activeMember.body.id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: activeMember.body.version as number,
          role: 'PRODUCT_OWNER',
          capacity: 40,
          displayName: 'Alice Product',
        })
        .expect(200);
      expect(updatedMember.body.role).toBe('PRODUCT_OWNER');
      expect(updatedMember.body.capacity).toBe(40);

      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/team/${activeMember.body.id as string}`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          expectedVersion: activeMember.body.version as number,
          capacity: 20,
        })
        .expect(409);

      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-invalid-capacity')
        .send({
          displayName: 'Invalid Capacity',
          role: 'QA',
          capacity: 0,
          status: 'ACTIVE',
        })
        .expect(400);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-invalid-role')
        .send({
          displayName: 'Invalid Role',
          role: 'ADMIN',
          capacity: 10,
          status: 'ACTIVE',
        })
        .expect(400);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('Idempotency-Key', 'team-invalid-email')
        .send({
          displayName: 'Invalid Email',
          email: 'not-email',
          role: 'QA',
          capacity: 10,
          status: 'ACTIVE',
        })
        .expect(400);

      const deactivated = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/team/${activeMember.body.id as string}/deactivate`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: updatedMember.body.version as number })
        .expect(201);
      expect(deactivated.body.status).toBe('INACTIVE');
      expect(deactivated.body.deactivatedAt).toBeTruthy();

      const blockedReadiness = await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/readiness`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(blockedReadiness.body.status).toBe('BACKLOG_READY');
      expect(blockedReadiness.body.blockingReasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'MINIMUM_TEAM_AND_CAPACITY_REQUIRED',
          }),
        ]),
      );

      const activated = await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/team/${plannedMember.body.id as string}/activate`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ expectedVersion: plannedMember.body.version as number })
        .expect(201);
      expect(activated.body.status).toBe('ACTIVE');

      await context.http
        .patch(`/api/v1/projects/${fixtures.projectId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ readiness: 'READY_TO_START' })
        .expect(400);

      const secondOrg = await registerAndBootstrapOrganization(
        context,
        'project-team-cross-org',
      );
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .expect(403);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .set('Idempotency-Key', 'team-cross-create')
        .send({
          displayName: 'Cross Org',
          role: 'OBSERVER',
          capacity: 4,
          status: 'PLANNED',
        })
        .expect(403);
      await context.http
        .patch(
          `/api/v1/projects/${fixtures.projectId}/team/${activated.body.id as string}`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({
          expectedVersion: activated.body.version as number,
          capacity: 8,
        })
        .expect(403);
      await context.http
        .post(
          `/api/v1/projects/${fixtures.projectId}/team/${activated.body.id as string}/deactivate`,
        )
        .set('Authorization', `Bearer ${secondOrg.ownerAccessToken}`)
        .send({ expectedVersion: activated.body.version as number })
        .expect(403);

      const readRole = await context.http
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ organizationId, key: 'TEAM_READ_ONLY_ROLE', name: 'Team Read' })
        .expect(201);
      await context.http
        .post(`/api/v1/roles/${readRole.body.id as string}/permissions`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          permissionKeys: ['projects.project.read', 'projects.team.read'],
        })
        .expect(201);
      const readUser = await registerNativeUser(context, {
        email: 'team-read@test.dev',
        displayName: 'Team Read',
        password: 'TeamRead123!',
      });
      await context.http
        .post('/api/v1/role-assignments')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          organizationId,
          principalId: readUser.body.user.id as string,
          roleId: readRole.body.id as string,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        })
        .expect(201);
      const readLogin = await loginNativeUser(context, {
        email: 'team-read@test.dev',
        password: 'TeamRead123!',
        activeOrganizationId: organizationId,
      });
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set('Authorization', `Bearer ${readLogin.body.accessToken as string}`)
        .set('Idempotency-Key', 'team-no-manage')
        .send({
          displayName: 'No Manage',
          role: 'OBSERVER',
          capacity: 1,
          status: 'PLANNED',
        })
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
      await context.http
        .get(`/api/v1/projects/${fixtures.projectId}/team`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .expect(200);
      await context.http
        .post(`/api/v1/projects/${fixtures.projectId}/team`)
        .set(
          'Authorization',
          `Bearer ${readOnlyLogin.body.accessToken as string}`,
        )
        .set('Idempotency-Key', 'team-readonly-create')
        .send({
          displayName: 'Readonly',
          role: 'OBSERVER',
          capacity: 1,
          status: 'PLANNED',
        })
        .expect(403);

      const audits = await context.models.auditLogs.find({
        organizationId,
        resourceType: 'PROJECT_MEMBERSHIP',
      });
      expect(audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining([
          'projects.team.create',
          'projects.team.update',
          'projects.team.deactivate',
          'projects.team.activate',
        ]),
      );

      const activity = await context.http
        .get(
          `/api/v1/projects/${fixtures.projectId}/activity?resourceKind=TEAM_MEMBER`,
        )
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(
        activity.body.items.map((event: { type: string }) => event.type),
      ).toEqual(
        expect.arrayContaining([
          'TEAM_MEMBER_CREATED',
          'TEAM_MEMBER_UPDATED',
          'TEAM_MEMBER_DEACTIVATED',
          'TEAM_MEMBER_ACTIVATED',
        ]),
      );

      expect(prepared.sprintId).toBeTruthy();
    } finally {
      await context.close();
    }
  });
});
