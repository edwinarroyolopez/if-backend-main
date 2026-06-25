import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { AccessControlController } from './access-control.controller';
import { AccessControlProjectAccessService } from './access-control-project-access.service';
import { AccessControlReadersService } from './access-control-readers.service';
import { AccessControlRoleManagerService } from './access-control-role-manager.service';
import { AccessControlScopeValidatorService } from './access-control-scope-validator.service';
import { AccessControlService } from './access-control.service';
import { AccessPolicy, AccessPolicySchema } from './access-policy.schema';
import { PermissionCatalogService } from './permission-catalog.service';
import { PermissionGuard } from './permission.guard';
import {
  PermissionDefinition,
  PermissionDefinitionSchema,
} from './permission-definition.schema';
import { PrincipalAuthorizationStore } from './principal-authorization-store.service';
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
    AccessControlProjectAccessService,
    AccessControlReadersService,
    AccessControlRoleManagerService,
    AccessControlScopeValidatorService,
    PermissionCatalogService,
    PrincipalAuthorizationStore,
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
