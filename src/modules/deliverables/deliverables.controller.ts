import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { MongoIdParamPipe } from 'src/common/pipes/mongo-id-param.pipe';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { DeliverablesService } from './deliverables.service';

class CreateDeliverableDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;
}

@Controller('deliverables')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class DeliverablesController {
  constructor(private readonly deliverablesService: DeliverablesService) {}

  @Get()
  @RequirePermission('deliverables.deliverable.read')
  @ResolveResource({
    type: 'MODULE',
    moduleKey: 'deliverables',
    allowProjectScope: true,
  })
  async listDeliverables(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      items: await this.deliverablesService.listDeliverables(principal),
    };
  }

  @Post()
  @RequirePermission('deliverables.deliverable.create')
  @ResolveResource({
    type: 'PROJECT',
    bodyField: 'projectId',
    moduleKey: 'deliverables',
  })
  async createDeliverable(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateDeliverableDto,
  ) {
    const deliverable = await this.deliverablesService.createDeliverable(
      principal,
      dto,
    );
    return { id: deliverable.id, status: deliverable.status };
  }

  @Post(':deliverableId/approve')
  @RequirePermission('deliverables.deliverable.approve')
  @ResolveResource({
    type: 'DELIVERABLE',
    param: 'deliverableId',
    moduleKey: 'deliverables',
  })
  async approveDeliverable(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('deliverableId', MongoIdParamPipe) deliverableId: string,
  ) {
    const deliverable = await this.deliverablesService.approveDeliverable(
      principal,
      deliverableId,
    );
    return { id: deliverable.id, status: deliverable.status };
  }
}
