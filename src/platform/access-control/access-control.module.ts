import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { AccessPolicy, AccessPolicySchema } from './access-policy.schema';
import { PermissionGuard } from './permission.guard';
import {
  PermissionDefinition,
  PermissionDefinitionSchema,
} from './permission-definition.schema';
import { PrincipalAuthorizationService } from './principal-authorization.service';
import { ReadOnlySessionGuard } from './read-only-session.guard';
import { ResourceScopeService } from './resource-scope.service';
import { RoleAssignment, RoleAssignmentSchema } from './role-assignment.schema';
import { RolePermission, RolePermissionSchema } from './role-permission.schema';
import { Role, RoleSchema } from './role.schema';
import { IdentityModule } from 'src/platform/identity/identity.module';

@Module({
  imports: [
    IdentityModule,
    MongooseModule.forFeature([
      { name: PermissionDefinition.name, schema: PermissionDefinitionSchema },
      { name: Role.name, schema: RoleSchema },
      { name: RolePermission.name, schema: RolePermissionSchema },
      { name: RoleAssignment.name, schema: RoleAssignmentSchema },
      { name: AccessPolicy.name, schema: AccessPolicySchema },
    ]),
  ],
  controllers: [AccessControlController],
  providers: [
    AccessControlService,
    PrincipalAuthorizationService,
    TransactionManagerService,
    ResourceScopeService,
    PermissionGuard,
    ReadOnlySessionGuard,
  ],
  exports: [
    AccessControlService,
    PrincipalAuthorizationService,
    ResourceScopeService,
    PermissionGuard,
    ReadOnlySessionGuard,
  ],
})
export class AccessControlModule {}
