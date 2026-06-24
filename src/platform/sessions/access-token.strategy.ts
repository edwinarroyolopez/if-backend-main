import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { AccessTokenSessionValidator } from './access-token-session.validator';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly accessTokenSessionValidator: AccessTokenSessionValidator,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('app.jwtAccessSecret'),
      issuer: configService.getOrThrow<string>('app.jwtIssuer'),
      audience: configService.getOrThrow<string>('app.jwtAudience'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(
    payload: AuthenticatedPrincipal,
  ): Promise<AuthenticatedPrincipal> {
    return this.accessTokenSessionValidator.validate(payload);
  }
}
