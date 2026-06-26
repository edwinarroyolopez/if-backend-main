import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConnectorSecretCryptoService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return ['v1', encode(iv), encode(tag), encode(encrypted)].join(':');
  }

  decrypt(ciphertext: string) {
    const [version, iv, tag, encrypted] = ciphertext.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new Error('Invalid connector secret ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(), decode(iv));
    decipher.setAuthTag(decode(tag));
    return Buffer.concat([
      decipher.update(decode(encrypted)),
      decipher.final(),
    ]).toString('utf8');
  }

  private key() {
    return createHash('sha256')
      .update(
        this.configService.getOrThrow<string>('app.ifConnectorsSecretKey'),
      )
      .digest();
  }
}

function encode(value: Buffer) {
  return value.toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url');
}
