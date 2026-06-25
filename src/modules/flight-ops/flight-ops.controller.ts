import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { CreateMissionDto, ListMissionsQueryDto } from './flight-ops.dto';
import { FlightOpsService } from './flight-ops.service';

@Controller('missions')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class FlightOpsController {
  constructor(private readonly flightOpsService: FlightOpsService) {}

  @Get()
  @RequirePermission('flight.mission.read')
  @ResolveResource({
    type: 'MODULE',
    moduleKey: 'flight',
    allowProjectScope: true,
  })
  async listMissions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ListMissionsQueryDto,
  ) {
    return {
      items: await this.flightOpsService.listMissions(principal, query),
    };
  }

  @Post()
  @RequirePermission('flight.mission.create')
  @ResolveResource({
    type: 'PROJECT',
    bodyField: 'projectId',
    moduleKey: 'flight',
  })
  async createMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateMissionDto,
  ) {
    const mission = await this.flightOpsService.createMission({
      ...dto,
      createdBy: principal.sub,
    });
    return {
      id: mission.id,
      organizationId: mission.organizationId,
      projectId: mission.projectId,
      key: mission.key,
      name: mission.name,
      status: mission.status,
    };
  }

  @Get(':missionId')
  @RequirePermission('flight.mission.read')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async getMission(@Param('missionId') missionId: string) {
    const mission = await this.flightOpsService.getMission(missionId);
    return {
      id: mission.id,
      key: mission.key,
      name: mission.name,
      projectId: mission.projectId,
      status: mission.status,
    };
  }

  @Post(':missionId/complete')
  @RequirePermission('flight.mission.complete')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async completeMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId') missionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new AppException(
        409,
        REASON_CODES.IDEMPOTENCY_CONFLICT,
        'Idempotency-Key header is required',
      );
    }
    return this.flightOpsService.completeMission(
      principal,
      missionId,
      idempotencyKey,
    );
  }
}
