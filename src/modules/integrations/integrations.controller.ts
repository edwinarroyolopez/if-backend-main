import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsArray,
  IsMongoId,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';

class CreateServiceAccountDto {
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

  @IsString()
  ownerModule!: string;

  @IsArray()
  @IsString({ each: true })
  allowedAudiences!: string[];

  @IsMongoId()
  roleId!: string;
}

class IssueServiceTokenDto {
  @IsString()
  keyId!: string;

  @IsString()
  clientSecret!: string;

  @IsString()
  audience!: string;
}

@Controller()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('service-accounts')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
  @RequirePermission('integrations.service_account.create')
  @ResolveResource({
    type: 'ORGANIZATION',
    bodyField: 'organizationId',
    moduleKey: 'integrations',
  })
  async createServiceAccount(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateServiceAccountDto,
  ) {
    const result = await this.integrationsService.createServiceAccount(
      principal,
      dto,
    );
    return {
      id: result.serviceAccount.id,
      keyId: result.keyId,
      clientSecret: result.clientSecret,
    };
  }

  @Post('service-accounts/:serviceAccountId/rotate-credential')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @RequirePermission('integrations.service_account.rotate')
  @ResolveResource({ type: 'MODULE', moduleKey: 'integrations' })
  async rotateServiceCredential(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('serviceAccountId') serviceAccountId: string,
  ) {
    return this.integrationsService.rotateCredential(
      principal,
      serviceAccountId,
    );
  }

  @Post('auth/service/token')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async issueServiceToken(@Body() dto: IssueServiceTokenDto) {
    return this.integrationsService.issueServiceAccessToken(dto);
  }
}
