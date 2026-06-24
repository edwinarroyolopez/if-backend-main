import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { SalesService } from './sales.service';

class CreateOpportunityDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  clientId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;
}

class ConvertOpportunityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  projectKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  projectName!: string;
}

@Controller('opportunities')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly transactionManagerService: TransactionManagerService,
  ) {}

  @Post()
  @RequirePermission('sales.opportunity.create')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'sales',
  })
  async createOpportunity(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateOpportunityDto,
  ) {
    const opportunity = await this.salesService.createOpportunity({
      ...dto,
      createdBy: principal.sub,
    });
    return {
      id: opportunity.id,
      name: opportunity.name,
      status: opportunity.status,
    };
  }

  @Post(':opportunityId/convert-to-project')
  @RequirePermission('sales.opportunity.convert_to_project')
  @ResolveResource({ type: 'MODULE', moduleKey: 'sales' })
  async convertToProject(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: ConvertOpportunityDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.transactionManagerService.runInTransaction(
      (session) =>
        this.salesService.convertOpportunityToProject(
          opportunityId,
          {
            projectKey: dto.projectKey,
            projectName: dto.projectName,
            actorUserId: principal.sub,
          },
          session,
        ),
    );

    return {
      opportunityId: result.opportunity.id,
      projectId: result.project.id,
    };
  }
}
