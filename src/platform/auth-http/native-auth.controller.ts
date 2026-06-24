import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { SessionsService } from 'src/platform/sessions/sessions.service';

@Controller('auth/native')
export class NativeAuthController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterDto) {
    return this.sessionsService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    return this.sessionsService.login(dto);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(@Body() dto: RefreshDto) {
    return this.sessionsService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
  async logout(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    await this.sessionsService.logout(principal);
    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
  async logoutAll(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    await this.sessionsService.logoutAll(principal);
    return { success: true };
  }
}
