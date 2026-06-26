import { registerAs } from '@nestjs/config';

type SameSiteMode = 'strict' | 'lax' | 'none';

export type ValidatedEnv = {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  corsOrigins: string[];
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  refreshCookieName: string;
  refreshCookiePath: string;
  refreshCookieDomain?: string;
  refreshCookieSecure: boolean;
  refreshCookieSameSite: 'strict' | 'lax' | 'none';
  refreshCookieMaxAgeMs: number;
  argon2MemoryCost: number;
  argon2TimeCost: number;
  argon2Parallelism: number;
  superadminEmail: string;
  superadminName: string;
  superadminPassword?: string;
  documentImportPreviewTokenSecret: string;
  ifConnectorsBaseUrl: string;
  ifConnectorsTimeoutMs: number;
  ifConnectorsSecretKey: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
};

export function validateEnv(rawEnv: Record<string, unknown>): ValidatedEnv {
  const env = rawEnv as Record<string, string | undefined>;
  const sameSite = (env.REFRESH_COOKIE_SAME_SITE ?? 'lax') as SameSiteMode;
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('REFRESH_COOKIE_SAME_SITE must be strict, lax or none');
  }

  const validated: ValidatedEnv = {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: parseInteger(env.PORT, 'PORT'),
    mongodbUri: requireValue(env.MONGODB_URI, 'MONGODB_URI'),
    corsOrigins: requireValue(env.CORS_ORIGINS, 'CORS_ORIGINS')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    jwtAccessSecret: requireValue(env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'),
    jwtRefreshSecret: requireValue(
      env.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
    ),
    jwtIssuer: requireValue(env.JWT_ISSUER, 'JWT_ISSUER'),
    jwtAudience: requireValue(env.JWT_AUDIENCE, 'JWT_AUDIENCE'),
    jwtAccessTtl: requireValue(env.JWT_ACCESS_TTL, 'JWT_ACCESS_TTL'),
    jwtRefreshTtl: requireValue(env.JWT_REFRESH_TTL, 'JWT_REFRESH_TTL'),
    refreshCookieName: requireValue(
      env.REFRESH_COOKIE_NAME,
      'REFRESH_COOKIE_NAME',
    ),
    refreshCookiePath: requireValue(
      env.REFRESH_COOKIE_PATH,
      'REFRESH_COOKIE_PATH',
    ),
    refreshCookieDomain: env.REFRESH_COOKIE_DOMAIN?.trim() || undefined,
    refreshCookieSecure: parseBoolean(
      env.REFRESH_COOKIE_SECURE,
      'REFRESH_COOKIE_SECURE',
    ),
    refreshCookieSameSite: sameSite,
    refreshCookieMaxAgeMs: parseDurationToMs(
      requireValue(env.JWT_REFRESH_TTL, 'JWT_REFRESH_TTL'),
    ),
    argon2MemoryCost: parseInteger(
      env.ARGON2_MEMORY_COST,
      'ARGON2_MEMORY_COST',
    ),
    argon2TimeCost: parseInteger(env.ARGON2_TIME_COST, 'ARGON2_TIME_COST'),
    argon2Parallelism: parseInteger(
      env.ARGON2_PARALLELISM,
      'ARGON2_PARALLELISM',
    ),
    superadminEmail:
      env.SUPERADMIN_EMAIL?.trim() || 'superadmin@inflight.local',
    superadminName: env.SUPERADMIN_NAME?.trim() || 'InflightOS Superadmin',
    superadminPassword: env.SUPERADMIN_PASSWORD?.trim(),
    documentImportPreviewTokenSecret:
      env.DOCUMENT_IMPORT_PREVIEW_TOKEN_SECRET?.trim() ||
      'inflight-project-document-import-preview-v1',
    ifConnectorsBaseUrl: requireValue(
      env.IF_CONNECTORS_BASE_URL,
      'IF_CONNECTORS_BASE_URL',
    ).replace(/\/+$/, ''),
    ifConnectorsTimeoutMs: parseInteger(
      env.IF_CONNECTORS_TIMEOUT_MS,
      'IF_CONNECTORS_TIMEOUT_MS',
    ),
    ifConnectorsSecretKey:
      env.IF_CONNECTORS_SECRET_KEY?.trim() ||
      (env.NODE_ENV === 'production'
        ? requireValue(env.IF_CONNECTORS_SECRET_KEY, 'IF_CONNECTORS_SECRET_KEY')
        : 'inflight-test-connectors-secret-key'),
    cloudinaryCloudName: env.CLOUDINARY_CLOUD?.trim() || undefined,
    cloudinaryApiKey: env.CLOUDINARY_KEY?.trim() || undefined,
    cloudinaryApiSecret: env.CLOUDINARY_SECRET?.trim() || undefined,
  };

  if (validated.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must not be empty');
  }
  if (validated.ifConnectorsTimeoutMs <= 0) {
    throw new Error('IF_CONNECTORS_TIMEOUT_MS must be greater than zero');
  }
  if (validated.ifConnectorsSecretKey.length < 24) {
    throw new Error('IF_CONNECTORS_SECRET_KEY must be at least 24 characters');
  }
  const hasPartialCloudinaryConfig = Boolean(
    validated.cloudinaryCloudName ||
    validated.cloudinaryApiKey ||
    validated.cloudinaryApiSecret,
  );
  const hasCompleteCloudinaryConfig = Boolean(
    validated.cloudinaryCloudName &&
    validated.cloudinaryApiKey &&
    validated.cloudinaryApiSecret,
  );
  if (hasPartialCloudinaryConfig && !hasCompleteCloudinaryConfig) {
    throw new Error(
      'CLOUDINARY_CLOUD, CLOUDINARY_KEY and CLOUDINARY_SECRET must be configured together',
    );
  }
  if (validated.nodeEnv === 'production' && !hasCompleteCloudinaryConfig) {
    throw new Error('Cloudinary configuration is required in production');
  }

  return validated;
}

export const buildAppConfig = registerAs('app', () => validateEnv(process.env));

function requireValue(value: string | undefined, label: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseInteger(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(requireValue(value, label), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid integer`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, label: string): boolean {
  const normalized = requireValue(value, label).toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  throw new Error(`${label} must be true or false`);
}

export function parseDurationToMs(value: string): number {
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Unsupported duration format: ${value}`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
}
