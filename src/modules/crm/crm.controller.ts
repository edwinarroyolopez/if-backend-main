import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { CrmService } from './crm.service';

class CreateClientDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post()
  @RequirePermission('crm.client.create')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'crm',
  })
  async createClient(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateClientDto,
  ) {
    const client = await this.crmService.createClient({
      ...dto,
      createdBy: principal.sub,
    });
    return {
      id: client.id,
      key: client.key,
      name: client.name,
      status: client.status,
    };
  }

  @Get()
  @RequirePermission('crm.client.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'crm' })
  async listClients(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      items: await this.crmService.listClients(principal.activeOrganizationId!),
    };
  }
}
