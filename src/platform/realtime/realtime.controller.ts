import { Controller, Sse, UseGuards } from '@nestjs/common';
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
    return this.realtimeService.stream(principal.activeOrganizationId!);
  }
}
