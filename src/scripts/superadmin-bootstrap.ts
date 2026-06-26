import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { normalizeEmail } from 'src/common/utils/hash.util';
import { AppModule } from 'src/app.module';
import type { OrganizationDocument } from 'src/modules/organizations/organization.schema';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import type { PermissionDefinitionDocument } from 'src/platform/access-control/permission-definition.schema';
import { SUPERADMIN_ROLE_KEY } from 'src/platform/access-control/permission-registry';
import type { RoleAssignmentDocument } from 'src/platform/access-control/role-assignment.schema';
import type { RoleDocument } from 'src/platform/access-control/role.schema';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { PasswordHasherService } from 'src/platform/identity/password-hasher.service';
import type { UserDocument } from 'src/platform/identity/user.schema';
import {
  DEFAULT_ORGANIZATION_KEY,
  DEFAULT_ORGANIZATION_NAME,
  resolveSuperadminBootstrapConfig,
} from './superadmin-bootstrap-config';
import { getSuperadminBootstrapModels } from './superadmin-bootstrap-models';
import { setActivePasswordCredential } from './superadmin-bootstrap-password';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const configService = app.get(ConfigService);
    const {
      configuredEmail,
      configuredName,
      configuredPassword,
      bootstrapPassword,
    } = resolveSuperadminBootstrapConfig(configService);

    const transactionManagerService = app.get(TransactionManagerService);
    const accessControlService = app.get(AccessControlService);
    const identityService = app.get(IdentityService);
    const passwordHasherService = app.get(PasswordHasherService);
    const auditService = app.get(AuditService);
    const projectsService = app.get(ProjectsService);
    const {
      organizationModel,
      userModel,
      credentialModel,
      roleAssignmentModel,
      rolePermissionModel,
      permissionDefinitionModel,
      roleModel,
    } = getSuperadminBootstrapModels(app);
    const normalizedEmail = normalizeEmail(configuredEmail);

    const result = await transactionManagerService.runInTransaction(
      async (session) => {
        let user = (await userModel
          .findOne({ normalizedEmail })
          .session(session)) as UserDocument | null;
        const userAlreadyExisted = Boolean(user);
        if (!user) {
          [user] = (await userModel.create(
            [
              {
                email: configuredEmail,
                normalizedEmail,
                displayName: configuredName,
                status: 'ACTIVE',
                sessionVersion: 0,
                authorizationVersion: 0,
              },
            ],
            { session },
          )) as UserDocument[];
          await auditService.record(
            {
              actorType: 'SYSTEM',
              actorId: user.id,
              action: 'admin.superadmin.user_create',
              resourceType: 'USER',
              resourceId: user.id,
              after: { email: user.email },
            },
            session,
          );
        } else if (user.status !== 'ACTIVE') {
          user.status = 'ACTIVE';
          user.displayName = configuredName;
          await user.save({ session });
        }

        let organization = (await organizationModel
          .findOne({ key: DEFAULT_ORGANIZATION_KEY })
          .session(session)) as OrganizationDocument | null;
        if (!organization) {
          [organization] = (await organizationModel.create(
            [
              {
                key: DEFAULT_ORGANIZATION_KEY,
                name: DEFAULT_ORGANIZATION_NAME,
                status: 'ACTIVE',
                createdBy: user.id,
              },
            ],
            { session },
          )) as OrganizationDocument[];
        } else if (organization.status !== 'ACTIVE') {
          organization.status = 'ACTIVE';
          organization.name = DEFAULT_ORGANIZATION_NAME;
          await organization.save({ session });
        }

        const superadminRole = await accessControlService.ensureSystemRole(
          organization.id,
          {
            key: SUPERADMIN_ROLE_KEY,
            name: 'Super Administrator',
          },
          session,
        );
        const permissionDefinitions = (await permissionDefinitionModel
          .find({ status: 'ACTIVE' })
          .sort({ key: 1 })
          .session(session)) as PermissionDefinitionDocument[];
        const activePermissionKeys = permissionDefinitions.map(
          (permission) => permission.key,
        );
        await accessControlService.assignPermissionsToRole(
          organization.id,
          superadminRole.id,
          activePermissionKeys,
          session,
        );

        if (configuredPassword) {
          await setActivePasswordCredential(
            credentialModel,
            passwordHasherService,
            user.id,
            configuredPassword,
            session,
          );
        } else {
          await identityService.ensureActivePasswordCredential(
            user.id,
            bootstrapPassword,
            session,
          );
        }
        await credentialModel.updateMany(
          {
            principalId: user.id,
            type: 'PASSWORD',
            status: 'REVOKED',
            rotatedAt: { $exists: false },
          },
          { $set: { rotatedAt: new Date() } },
          { session },
        );
        if (userAlreadyExisted) {
          await identityService.bumpSessionVersion(user.id, session);
        }
        await auditService.record(
          {
            actorType: 'SYSTEM',
            actorId: user.id,
            organizationId: organization.id,
            action: 'auth.password.rotate',
            resourceType: 'USER',
            resourceId: user.id,
          },
          session,
        );

        const existingAssignment = (await roleAssignmentModel
          .findOne({
            organizationId: organization.id,
            principalType: 'USER',
            principalId: user.id,
            roleId: superadminRole.id,
            scopeType: 'ORGANIZATION',
            scopeId: organization.id,
          })
          .session(session)) as RoleAssignmentDocument | null;
        if (!existingAssignment) {
          if (userAlreadyExisted) {
            await accessControlService.assignRoleToPrincipal(
              {
                organizationId: organization.id,
                principalType: 'USER',
                principalId: user.id,
                roleId: superadminRole.id,
                scopeType: 'ORGANIZATION',
                scopeId: organization.id,
                assignedBy: user.id,
              },
              session,
            );
          } else {
            await roleAssignmentModel.create(
              [
                {
                  organizationId: organization.id,
                  principalType: 'USER',
                  principalId: user.id,
                  roleId: superadminRole.id,
                  scopeType: 'ORGANIZATION',
                  scopeId: organization.id,
                  status: 'ACTIVE',
                  assignedBy: user.id,
                },
              ],
              { session },
            );
            await identityService.bumpAuthorizationVersion(user.id, session);
          }
        } else if (existingAssignment.status !== 'ACTIVE') {
          existingAssignment.status = 'ACTIVE';
          existingAssignment.assignedBy = user.id;
          existingAssignment.validFrom = undefined;
          existingAssignment.validTo = undefined;
          await existingAssignment.save({ session });
          await identityService.bumpAuthorizationVersion(user.id, session);
        }

        const reconciledProjectCount =
          await projectsService.reconcileLegacyProjectAccessPolicies(
            organization.id,
            user.id,
            session,
          );
        await auditService.record(
          {
            actorType: 'SYSTEM',
            actorId: user.id,
            organizationId: organization.id,
            action: 'admin.superadmin.bootstrap',
            resourceType: 'ROLE',
            resourceId: superadminRole.id,
            after: {
              organizationKey: organization.key,
              email: user.email,
              reconciledProjectCount,
            },
          },
          session,
        );

        const assignedPermissionCount = await rolePermissionModel
          .countDocuments({ roleId: superadminRole.id })
          .session(session);
        const refreshedRole = (await roleModel
          .findById(superadminRole.id)
          .session(session)) as RoleDocument | null;
        if (!refreshedRole) {
          throw new Error('Superadmin role disappeared during bootstrap');
        }

        return {
          organizationId: organization.id,
          organizationKey: organization.key,
          userId: user.id,
          email: user.email,
          roleId: refreshedRole.id,
          roleKey: refreshedRole.key,
          activePermissionCount: activePermissionKeys.length,
          assignedPermissionCount,
          password: bootstrapPassword,
        };
      },
    );

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown bootstrap error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
