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
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { ImageOpsService } from './image-ops.service';

class IngestMediaBatchDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  projectId!: string;

  @IsMongoId()
  missionId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;
}

class CreateSampleDto {
  @IsMongoId()
  mediaBatchId!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class ImageOpsController {
  constructor(private readonly imageOpsService: ImageOpsService) {}

  @Post('media-batches/ingest')
  @RequirePermission('image.media_batch.ingest')
  @ResolveResource({
    type: 'PROJECT',
    bodyField: 'projectId',
    moduleKey: 'image',
  })
  async ingest(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: IngestMediaBatchDto,
  ) {
    const mediaBatch = await this.imageOpsService.ingestMediaBatch(
      principal,
      dto,
    );
    return { id: mediaBatch.id, status: mediaBatch.status };
  }

  @Get('media-batches')
  @RequirePermission('image.media_batch.ingest')
  @ResolveResource({ type: 'MODULE', moduleKey: 'image' })
  async listMediaBatches(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      items: await this.imageOpsService.listMediaBatches(
        principal.activeOrganizationId!,
      ),
    };
  }

  @Post('samples')
  @RequirePermission('image.sample.approve')
  @ResolveResource({ type: 'MODULE', moduleKey: 'image' })
  async createSample(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateSampleDto,
  ) {
    const sample = await this.imageOpsService.createSample(principal, dto);
    return { id: sample.id, status: sample.status };
  }

  @Post('samples/:sampleId/approve')
  @RequirePermission('image.sample.approve')
  @ResolveResource({ type: 'MODULE', moduleKey: 'image' })
  async approveSample(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('sampleId') sampleId: string,
  ) {
    const sample = await this.imageOpsService.approveSample(
      principal,
      sampleId,
    );
    return { id: sample.id, status: sample.status };
  }
}
