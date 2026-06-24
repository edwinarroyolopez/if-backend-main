import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';

class BootstrapOrganizationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;
}

@Controller('organizations')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('bootstrap')
  async bootstrap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BootstrapOrganizationDto,
  ) {
    return this.organizationsService.bootstrapOrganization(principal, dto);
  }

  @Post(':organizationId/activate')
  async activateOrganization(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizationsService.activateOrganization(
      principal,
      organizationId,
    );
  }

  @Get('me')
  async listAccessibleOrganizations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      items:
        await this.organizationsService.listAccessibleOrganizations(principal),
    };
  }
}
