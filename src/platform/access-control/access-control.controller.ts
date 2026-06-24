import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from './current-principal.decorator';
import {
  RequirePermission,
  ResolveResource,
} from './access-control.decorators';
import {
  AssignPermissionsDto,
  CreateRoleAssignmentDto,
  CreateRoleDto,
} from './access-control.dto';
import { AccessControlService } from './access-control.service';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { ReadOnlySessionGuard } from './read-only-session.guard';
import { PermissionGuard } from './permission.guard';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';

@Controller()
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class AccessControlController {
  constructor(
    private readonly accessControlService: AccessControlService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get('permissions')
  @RequirePermission('admin.permission.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'admin' })
  async listPermissions() {
    return { items: await this.accessControlService.listPermissions() };
  }

  @Get('admin/users')
  @RequirePermission('admin.user.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'admin' })
  async listUsers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('q') search?: string,
  ) {
    return {
      items: await this.accessControlService.listUsers(
        principal.activeOrganizationId!,
        search,
      ),
    };
  }

  @Get('roles')
  @RequirePermission('admin.role.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'admin' })
  async listRoles(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      items: await this.accessControlService.listRoles(
        principal.activeOrganizationId!,
      ),
    };
  }

  @Get('role-assignments')
  @RequirePermission('admin.role_assignment.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'admin' })
  async listRoleAssignments(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      items: await this.accessControlService.listRoleAssignments(
        principal.activeOrganizationId!,
      ),
    };
  }

  @Post('roles')
  @RequirePermission('admin.role.create')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'admin',
  })
  async createRole(@Body() dto: CreateRoleDto) {
    const role = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.accessControlService.createRole(
          dto.organizationId,
          { key: dto.key.trim(), name: dto.name.trim() },
          session,
        ),
    );
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      version: role.version,
    };
  }

  @Post('roles/:roleId/permissions')
  @RequirePermission('admin.permission.assign')
  @ResolveResource({ type: 'MODULE', moduleKey: 'admin' })
  async assignPermissions(
    @Param('roleId') roleId: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    const updatedRole = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.accessControlService.assignPermissionsToRole(
          roleId,
          dto.permissionKeys,
          session,
        ),
    );
    return { id: updatedRole.id, version: updatedRole.version };
  }

  @Post('role-assignments')
  @RequirePermission('admin.role.assign')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'admin',
  })
  async createRoleAssignment(
    @Body() dto: CreateRoleAssignmentDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const assignment = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.accessControlService.assignRoleToPrincipal(
          {
            organizationId: dto.organizationId,
            principalType: 'USER',
            principalId: dto.principalId,
            roleId: dto.roleId,
            scopeType: dto.scopeType,
            scopeId: dto.scopeId,
            assignedBy: principal.sub,
          },
          session,
        ),
    );
    return { id: assignment.id };
  }
}
