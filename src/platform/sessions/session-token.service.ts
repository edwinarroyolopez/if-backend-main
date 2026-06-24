import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrincipalType, SessionKind } from 'src/common/types/domain.types';
import { parseDurationToMs } from 'src/platform/config/app-config';

type DurationExpression = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

export type AccessTokenPayload = {
  sub: string;
  principalType: PrincipalType;
  sessionId: string;
  sessionVersion: number;
  authorizationVersion: number;
  sessionKind: SessionKind;
  readOnly: boolean;
  activeOrganizationId?: string;
};

export type RefreshTokenPayload = {
  tokenType: 'REFRESH';
  sub: string;
  sessionId: string;
  sessionVersion: number;
  principalType: PrincipalType;
};

@Injectable()
export class SessionTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  issueAccessToken(payload: AccessTokenPayload): string {
    const expiresIn = this.configService.getOrThrow<string>(
      'app.jwtAccessTtl',
    ) as DurationExpression;
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('app.jwtAccessSecret'),
      issuer: this.configService.getOrThrow<string>('app.jwtIssuer'),
      audience: this.configService.getOrThrow<string>('app.jwtAudience'),
      algorithm: 'HS256',
      expiresIn,
      jwtid: randomUUID(),
    });
  }

  issueRefreshToken(payload: Omit<RefreshTokenPayload, 'tokenType'>): string {
    const expiresIn = this.configService.getOrThrow<string>(
      'app.jwtRefreshTtl',
    ) as DurationExpression;
    return this.jwtService.sign(
      { ...payload, tokenType: 'REFRESH' },
      {
        secret: this.configService.getOrThrow<string>('app.jwtRefreshSecret'),
        issuer: this.configService.getOrThrow<string>('app.jwtIssuer'),
        audience: this.configService.getOrThrow<string>('app.jwtAudience'),
        algorithm: 'HS256',
        expiresIn,
        jwtid: randomUUID(),
      },
    );
  }

  verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
      secret: this.configService.getOrThrow<string>('app.jwtRefreshSecret'),
      issuer: this.configService.getOrThrow<string>('app.jwtIssuer'),
      audience: this.configService.getOrThrow<string>('app.jwtAudience'),
      algorithms: ['HS256'],
    });
  }

  getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('app.refreshCookieSecure'),
      sameSite: this.configService.getOrThrow<'strict' | 'lax' | 'none'>(
        'app.refreshCookieSameSite',
      ),
      domain: this.configService.get<string>('app.refreshCookieDomain'),
      path: this.configService.getOrThrow<string>('app.refreshCookiePath'),
      maxAge: this.configService.getOrThrow<number>(
        'app.refreshCookieMaxAgeMs',
      ),
    } as const;
  }

  getRefreshCookieName() {
    return this.configService.getOrThrow<string>('app.refreshCookieName');
  }

  getRefreshTtlMs() {
    return parseDurationToMs(
      this.configService.getOrThrow<string>('app.jwtRefreshTtl'),
    );
  }

  getAccessTtlMs() {
    return parseDurationToMs(
      this.configService.getOrThrow<string>('app.jwtAccessTtl'),
    );
  }
}
