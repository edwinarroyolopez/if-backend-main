import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { normalizeEmail } from 'src/common/utils/hash.util';
import { AppModule } from 'src/app.module';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { Organization, OrganizationDocument } from 'src/modules/organizations/organization.schema';
import { AccessControlService } from 'src/platform/access-control/access-control.service';
import { PermissionDefinition, PermissionDefinitionDocument } from 'src/platform/access-control/permission-definition.schema';
import { SUPERADMIN_ROLE_KEY } from 'src/platform/access-control/permission-registry';
import { RoleAssignment, RoleAssignmentDocument } from 'src/platform/access-control/role-assignment.schema';
import { RolePermission, RolePermissionDocument } from 'src/platform/access-control/role-permission.schema';
import { Role, RoleDocument } from 'src/platform/access-control/role.schema';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { Credential, CredentialDocument } from 'src/platform/identity/credential.schema';
import { IdentityService } from 'src/platform/identity/identity.service';
import { PasswordHasherService } from 'src/platform/identity/password-hasher.service';
import { User, UserDocument } from 'src/platform/identity/user.schema';

const DEFAULT_ORGANIZATION_KEY = 'inflight-local';
const DEFAULT_ORGANIZATION_NAME = 'InflightOS Local';
const DEFAULT_SUPERADMIN_EMAIL = 'superadmin@inflight.local';
const DEFAULT_SUPERADMIN_NAME = 'InflightOS Superadmin';
const configuredEmail = process.env.SUPERADMIN_EMAIL?.trim() ?? DEFAULT_SUPERADMIN_EMAIL;
const configuredName = process.env.SUPERADMIN_NAME?.trim() ?? DEFAULT_SUPERADMIN_NAME;
const configuredPassword = process.env.SUPERADMIN_PASSWORD?.trim();
const bootstrapPassword = configuredPassword ?? generatePassword();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const transactionManagerService = app.get(TransactionManagerService);
    const accessControlService = app.get(AccessControlService);
    const identityService = app.get(IdentityService);
    const passwordHasherService = app.get(PasswordHasherService);
    const auditService = app.get(AuditService);
    const projectsService = app.get(ProjectsService);
    const organizationModel = app.get<Model<OrganizationDocument>>(
      getModelToken(Organization.name),
    );
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const credentialModel = app.get<Model<CredentialDocument>>(
      getModelToken(Credential.name),
    );
    const roleAssignmentModel = app.get<Model<RoleAssignmentDocument>>(
      getModelToken(RoleAssignment.name),
    );
    const rolePermissionModel = app.get<Model<RolePermissionDocument>>(
      getModelToken(RolePermission.name),
    );
    const permissionDefinitionModel = app.get<Model<PermissionDefinitionDocument>>(
      getModelToken(PermissionDefinition.name),
    );
    const roleModel = app.get<Model<RoleDocument>>(getModelToken(Role.name));
    const normalizedEmail = normalizeEmail(configuredEmail);

    const result = await transactionManagerService.runInTransaction(
      async (session: ClientSession) => {
        let user = await userModel.findOne({ normalizedEmail }).session(session);
        const userAlreadyExisted = Boolean(user);
        if (!user) {
          [user] = await userModel.create(
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
          );
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

        let organization = await organizationModel
          .findOne({ key: DEFAULT_ORGANIZATION_KEY })
          .session(session);
        if (!organization) {
          [organization] = await organizationModel.create(
            [
              {
                key: DEFAULT_ORGANIZATION_KEY,
                name: DEFAULT_ORGANIZATION_NAME,
                status: 'ACTIVE',
                createdBy: user.id,
              },
            ],
            { session },
          );
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
        const activePermissionKeys = (
          await permissionDefinitionModel
            .find({ status: 'ACTIVE' })
            .sort({ key: 1 })
            .session(session)
        ).map((permission) => permission.key);
        await accessControlService.assignPermissionsToRole(
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

        const existingAssignment = await roleAssignmentModel
          .findOne({
            organizationId: organization.id,
            principalType: 'USER',
            principalId: user.id,
            roleId: superadminRole.id,
            scopeType: 'ORGANIZATION',
            scopeId: organization.id,
          })
          .session(session);
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
        const refreshedRole = await roleModel.findById(superadminRole.id).session(session);
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
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function generatePassword() {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

async function setActivePasswordCredential(
  credentialModel: Model<CredentialDocument>,
  passwordHasherService: PasswordHasherService,
  userId: string,
  password: string,
  session: ClientSession,
) {
  const passwordHash = await passwordHasherService.hash(password);
  await credentialModel.updateMany(
    {
      principalId: userId,
      type: 'PASSWORD',
      status: 'ACTIVE',
    },
    { $set: { status: 'REVOKED', rotatedAt: new Date() } },
    { session },
  );
  await credentialModel.create(
    [
      {
        principalId: userId,
        type: 'PASSWORD',
        passwordHash,
        status: 'ACTIVE',
        rotatedAt: new Date(),
      },
    ],
    { session },
  );
}
