import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { MongoIdParamPipe } from 'src/common/pipes/mongo-id-param.pipe';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import {
  AssignMissionDto,
  CompleteMissionDto,
  CreateMissionDto,
  FailMissionDto,
  ListMissionsQueryDto,
  MissionObservationDto,
  RejectMissionDto,
  ReviewCloseMissionDto,
} from './flight-ops.dto';
import { FlightOpsService } from './flight-ops.service';
import {
  MAX_MISSION_MEDIA_BYTES,
  missionMediaFileFilter,
} from './mission-media-file.policy';

@Controller('missions')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class FlightOpsController {
  constructor(private readonly flightOpsService: FlightOpsService) {}

  @Get()
  @RequirePermission('flight.request.read')
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
  @RequirePermission('flight.request.create')
  @ResolveResource({
    type: 'PROJECT',
    bodyField: 'projectId',
    moduleKey: 'flight',
  })
  async createMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateMissionDto,
  ) {
    return this.flightOpsService.createMission(principal, dto);
  }

  @Get(':missionId')
  @RequirePermission('flight.request.read')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async getMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
  ) {
    return this.flightOpsService.getMission(principal, missionId);
  }

  @Post(':missionId/assign')
  @RequirePermission('flight.request.assign')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async assignMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: AssignMissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.assignMission(
      principal,
      missionId,
      dto.assignedPilotId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/accept')
  @RequirePermission('flight.request.start')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async acceptMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.acceptMission(
      principal,
      missionId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/reject')
  @RequirePermission('flight.request.start')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async rejectMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: RejectMissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.rejectMission(
      principal,
      missionId,
      dto.observations,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/start')
  @RequirePermission('flight.request.start')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async startMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.startMission(
      principal,
      missionId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/media')
  @RequirePermission('flight.media.upload')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MISSION_MEDIA_BYTES, files: 1 },
      fileFilter: missionMediaFileFilter,
    }),
  )
  async uploadMissionMedia(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size?: number;
        }
      | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.uploadMissionMedia(
      principal,
      missionId,
      file,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/complete')
  @RequirePermission('flight.request.complete')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async completeMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: CompleteMissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.completeMission(
      principal,
      missionId,
      dto.pilotObservations,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/review-close')
  @RequirePermission('flight.observation.write')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async reviewCloseMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: ReviewCloseMissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.reviewCloseMission(
      principal,
      missionId,
      dto.reviewObservations,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/cancel')
  @RequirePermission('flight.request.cancel')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async cancelMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: MissionObservationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.cancelMission(
      principal,
      missionId,
      dto.observations,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':missionId/fail')
  @RequirePermission('flight.request.complete')
  @ResolveResource({ type: 'MISSION', param: 'missionId', moduleKey: 'flight' })
  async failMission(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('missionId', MongoIdParamPipe) missionId: string,
    @Body() dto: FailMissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.flightOpsService.failMission(
      principal,
      missionId,
      dto.observations,
      requireIdempotencyKey(idempotencyKey),
    );
  }
}

function requireIdempotencyKey(idempotencyKey: string | undefined) {
  if (!idempotencyKey) {
    throw new AppException(
      409,
      REASON_CODES.IDEMPOTENCY_CONFLICT,
      'Idempotency-Key header is required',
    );
  }
  return idempotencyKey;
}
