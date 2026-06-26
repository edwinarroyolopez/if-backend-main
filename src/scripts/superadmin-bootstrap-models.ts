import { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from 'src/modules/organizations/organization.schema';
import {
  PermissionDefinition,
  PermissionDefinitionDocument,
} from 'src/platform/access-control/permission-definition.schema';
import {
  RoleAssignment,
  RoleAssignmentDocument,
} from 'src/platform/access-control/role-assignment.schema';
import {
  RolePermission,
  RolePermissionDocument,
} from 'src/platform/access-control/role-permission.schema';
import { Role, RoleDocument } from 'src/platform/access-control/role.schema';
import {
  Credential,
  CredentialDocument,
} from 'src/platform/identity/credential.schema';
import { User, UserDocument } from 'src/platform/identity/user.schema';

export function getSuperadminBootstrapModels(app: INestApplicationContext) {
  return {
    organizationModel: app.get<Model<OrganizationDocument>>(
      getModelToken(Organization.name),
    ),
    userModel: app.get<Model<UserDocument>>(getModelToken(User.name)),
    credentialModel: app.get<Model<CredentialDocument>>(
      getModelToken(Credential.name),
    ),
    roleAssignmentModel: app.get<Model<RoleAssignmentDocument>>(
      getModelToken(RoleAssignment.name),
    ),
    rolePermissionModel: app.get<Model<RolePermissionDocument>>(
      getModelToken(RolePermission.name),
    ),
    permissionDefinitionModel: app.get<Model<PermissionDefinitionDocument>>(
      getModelToken(PermissionDefinition.name),
    ),
    roleModel: app.get<Model<RoleDocument>>(getModelToken(Role.name)),
  };
}
