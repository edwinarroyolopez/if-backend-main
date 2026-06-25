import { validateEnv } from './app-config';

describe('app-config', () => {
  it('parses a valid environment', () => {
    const config = validateEnv({
      NODE_ENV: 'test',
      PORT: '3000',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      CORS_ORIGINS: 'http://localhost:3000',
      JWT_ACCESS_SECRET: 'access',
      JWT_REFRESH_SECRET: 'refresh',
      JWT_ISSUER: 'issuer',
      JWT_AUDIENCE: 'audience',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
      REFRESH_COOKIE_NAME: 'refresh_cookie',
      REFRESH_COOKIE_PATH: '/api/v1/auth/web',
      REFRESH_COOKIE_SECURE: 'false',
      REFRESH_COOKIE_SAME_SITE: 'lax',
      ARGON2_MEMORY_COST: '19456',
      ARGON2_TIME_COST: '2',
      ARGON2_PARALLELISM: '1',
      IF_CONNECTORS_BASE_URL: 'http://127.0.0.1:7100/api/v1',
      IF_CONNECTORS_TIMEOUT_MS: '5000',
    });

    expect(config.port).toBe(3000);
    expect(config.refreshCookieMaxAgeMs).toBeGreaterThan(0);
    expect(config.refreshCookieSameSite).toBe('lax');
    expect(config.ifConnectorsBaseUrl).toBe('http://127.0.0.1:7100/api/v1');
    expect(config.ifConnectorsTimeoutMs).toBe(5000);
  });
});
