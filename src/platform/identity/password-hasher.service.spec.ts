import { ConfigService } from '@nestjs/config';
import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const configService = new ConfigService({
    app: {
      argon2MemoryCost: 19456,
      argon2TimeCost: 2,
      argon2Parallelism: 1,
    },
  });
  const service = new PasswordHasherService(configService);

  it('hashes and verifies passwords', async () => {
    const hash = await service.hash('Password123456!');
    await expect(service.verify(hash, 'Password123456!')).resolves.toBe(true);
  });

  it('enforces password length policy', () => {
    expect(() => service.enforcePolicy('short')).toThrow();
    expect(() => service.enforcePolicy('Password123456!')).not.toThrow();
  });
});
