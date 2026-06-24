import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';

@Injectable()
export class PasswordHasherService {
  private dummyHashPromise?: Promise<string>;

  constructor(private readonly configService: ConfigService) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyAgainstDummyHash(password: string): Promise<void> {
    const dummyHash = await this.getDummyHash();
    await argon2.verify(dummyHash, password);
  }

  enforcePolicy(password: string): void {
    if (password.length < 12 || password.length > 128) {
      throw new Error('Password length must be between 12 and 128 characters');
    }
  }

  private get options(): argon2.Options & { raw?: false } {
    return {
      type: argon2.argon2id,
      memoryCost: this.configService.getOrThrow<number>('app.argon2MemoryCost'),
      timeCost: this.configService.getOrThrow<number>('app.argon2TimeCost'),
      parallelism: this.configService.getOrThrow<number>(
        'app.argon2Parallelism',
      ),
    };
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = argon2.hash(
        'InflightDummyPassword123!',
        this.options,
      );
    }
    return this.dummyHashPromise;
  }
}
