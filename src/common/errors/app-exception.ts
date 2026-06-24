import { HttpException } from '@nestjs/common';
import { ReasonCode } from './reason-codes';

export class AppException extends HttpException {
  readonly reasonCode: ReasonCode;
  readonly safeMetadata?: Record<string, unknown>;

  constructor(
    statusCode: number,
    reasonCode: ReasonCode,
    message: string,
    safeMetadata?: Record<string, unknown>,
  ) {
    super({ statusCode, reasonCode, message, safeMetadata }, statusCode);
    this.reasonCode = reasonCode;
    this.safeMetadata = safeMetadata;
  }
}
