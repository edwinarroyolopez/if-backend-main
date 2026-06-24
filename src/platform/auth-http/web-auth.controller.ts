import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { LoginDto, RegisterDto } from './auth.dto';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { SessionsService } from 'src/platform/sessions/sessions.service';
import { SessionTokenService } from 'src/platform/sessions/session-token.service';

@Controller('auth/web')
export class WebAuthController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.sessionsService.register(dto);
    response.cookie(
      this.sessionTokenService.getRefreshCookieName(),
      result.refreshToken,
      this.sessionTokenService.getRefreshCookieOptions(),
    );

    return {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.sessionsService.login(dto);
    response.cookie(
      this.sessionTokenService.getRefreshCookieName(),
      result.refreshToken,
      this.sessionTokenService.getRefreshCookieOptions(),
    );
    return {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[
      this.sessionTokenService.getRefreshCookieName()
    ] as string | undefined;
    if (!refreshToken) {
      throw new AppException(
        401,
        REASON_CODES.AUTH_REFRESH_INVALID,
        'Refresh token is required',
      );
    }

    const result = await this.sessionsService.refresh(refreshToken);
    response.cookie(
      this.sessionTokenService.getRefreshCookieName(),
      result.refreshToken,
      this.sessionTokenService.getRefreshCookieOptions(),
    );
    return {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
  async logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessionsService.logout(principal);
    response.clearCookie(
      this.sessionTokenService.getRefreshCookieName(),
      this.sessionTokenService.getRefreshCookieOptions(),
    );
    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
  async logoutAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessionsService.logoutAll(principal);
    response.clearCookie(
      this.sessionTokenService.getRefreshCookieName(),
      this.sessionTokenService.getRefreshCookieOptions(),
    );
    return { success: true };
  }
}
