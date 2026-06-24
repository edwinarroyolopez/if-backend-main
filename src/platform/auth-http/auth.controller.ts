import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { SessionsService } from 'src/platform/sessions/sessions.service';

@Controller('auth')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
export class AuthController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('me')
  async me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.sessionsService.me(principal);
  }

  @Get('sessions')
  async listSessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { items: await this.sessionsService.listSessions(principal) };
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('sessionId') sessionId: string,
  ) {
    await this.sessionsService.revokeOwnSession(principal, sessionId);
    return { success: true };
  }

  @Post('logout')
  async logout(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    await this.sessionsService.logout(principal);
    return { success: true };
  }

  @Post('logout-all')
  async logoutAll(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    await this.sessionsService.logoutAll(principal);
    return { success: true };
  }
}
