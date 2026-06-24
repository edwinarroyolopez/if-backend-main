import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  IsIn,
  IsMongoId,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentPrincipal } from './current-principal.decorator';
import {
  RequirePermission,
  ResolveResource,
} from './access-control.decorators';
import { AccessControlService } from './access-control.service';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { ReadOnlySessionGuard } from './read-only-session.guard';
import { PermissionGuard } from './permission.guard';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';

class CreateRoleDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;
}

class AssignPermissionsDto {
  @IsString({ each: true })
  permissionKeys!: string[];
}

class CreateRoleAssignmentDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  principalId!: string;

  @IsMongoId()
  roleId!: string;

  @IsIn([
    'ORGANIZATION',
    'MODULE',
    'PROJECT',
    'CLIENT',
    'MISSION',
    'MEDIA_BATCH',
    'DELIVERABLE',
    'INVOICE',
    'ENVIRONMENT',
  ])
  scopeType!:
    | 'ORGANIZATION'
    | 'MODULE'
    | 'PROJECT'
    | 'CLIENT'
    | 'MISSION'
    | 'MEDIA_BATCH'
    | 'DELIVERABLE'
    | 'INVOICE'
    | 'ENVIRONMENT';

  @IsString()
  scopeId!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class AccessControlController {
  constructor(
    private readonly accessControlService: AccessControlService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Get('permissions')
  async listPermissions() {
    return { items: await this.accessControlService.listPermissions() };
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
