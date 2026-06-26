import { MongoMemoryReplSet } from 'mongodb-memory-server';

export async function startMongoReplSet() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  return {
    replSet,
    uri: replSet.getUri(),
    stop: () => replSet.stop(),
  };
}

export function applyTestEnvironment(mongodbUri: string) {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3005';
  process.env.MONGODB_URI = mongodbUri;
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ISSUER = 'inflight-test';
  process.env.JWT_AUDIENCE = 'inflight-test';
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.REFRESH_COOKIE_NAME = 'inflight_refresh';
  process.env.REFRESH_COOKIE_PATH = '/api/v1/auth/web';
  process.env.REFRESH_COOKIE_DOMAIN = '';
  process.env.REFRESH_COOKIE_SECURE = 'false';
  process.env.REFRESH_COOKIE_SAME_SITE = 'lax';
  process.env.ARGON2_MEMORY_COST = '19456';
  process.env.ARGON2_TIME_COST = '2';
  process.env.ARGON2_PARALLELISM = '1';
  process.env.IF_CONNECTORS_BASE_URL = 'http://127.0.0.1:7100/api/v1';
  process.env.IF_CONNECTORS_TIMEOUT_MS = '5000';
  process.env.IF_CONNECTORS_SECRET_KEY = 'test-connectors-secret-key';
}
