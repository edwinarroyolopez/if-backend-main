import { Controller, Sse, UseGuards } from '@nestjs/common';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse('events')
  stream(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    if (!principal.activeOrganizationId) {
      throw new AppException(
        403,
        REASON_CODES.SCOPE_NOT_COVERED,
        'Active organization is required for realtime stream',
      );
    }
    return this.realtimeService.stream(principal.activeOrganizationId);
  }
}
