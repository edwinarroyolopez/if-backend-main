import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_ORGANIZATION_KEY = 'inflight-local';
export const DEFAULT_ORGANIZATION_NAME = 'InflightOS Local';

export function resolveSuperadminBootstrapConfig(configService: ConfigService) {
  const configuredEmail =
    configService.get<string>('app.superadminEmail')?.trim() ??
    'superadmin@inflight.local';
  const configuredName =
    configService.get<string>('app.superadminName')?.trim() ??
    'InflightOS Superadmin';
  const configuredPassword = configService
    .get<string>('app.superadminPassword')
    ?.trim();
  const bootstrapPassword = configuredPassword || generatePassword();
  return {
    configuredEmail,
    configuredName,
    configuredPassword,
    bootstrapPassword,
  };
}

function generatePassword() {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}
