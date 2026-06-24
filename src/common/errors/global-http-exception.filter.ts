import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './app-exception';
import { REASON_CODES } from './reason-codes';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host
      .switchToHttp()
      .getRequest<Request & { requestId?: string }>();
    const requestId =
      request.requestId ?? request.header('x-request-id') ?? 'unknown-request';

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        reasonCode: exception.reasonCode,
        message: exception.message,
        requestId,
        ...(exception.safeMetadata ? { metadata: exception.safeMetadata } : {}),
      });
      return;
    }

    if (exception instanceof BadRequestException) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        reasonCode: REASON_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        requestId,
        metadata: exception.getResponse(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        reasonCode: REASON_CODES.INTERNAL_ERROR,
        message: exception.message,
        requestId,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      reasonCode: REASON_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
      requestId,
    });
  }
}
