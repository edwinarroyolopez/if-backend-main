import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './app-exception';
import { REASON_CODES } from './reason-codes';

type ErrorBody = {
  statusCode: number;
  reasonCode: string;
  message: string;
  requestId: string;
  metadata?: unknown;
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

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
      const body: ErrorBody = {
        statusCode: HttpStatus.BAD_REQUEST,
        reasonCode: REASON_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        requestId,
        metadata: sanitizeValidationMetadata(exception.getResponse()),
      };
      this.logException(exception, request, requestId, body.reasonCode);
      response.status(HttpStatus.BAD_REQUEST).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const body = mapHttpException(exception, requestId);
      this.logException(exception, request, requestId, body.reasonCode);
      response.status(body.statusCode).json(body);
      return;
    }

    this.logException(
      exception,
      request,
      requestId,
      REASON_CODES.INTERNAL_ERROR,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      reasonCode: REASON_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
      requestId,
    });
  }

  private logException(
    exception: unknown,
    request: Request,
    requestId: string,
    reasonCode: string,
  ) {
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorName =
      exception instanceof Error ? exception.name : 'UnknownException';

    this.logger.error({
      requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode,
      reasonCode,
      errorName,
    });
  }
}

function mapHttpException(
  exception: HttpException,
  requestId: string,
): ErrorBody {
  const statusCode = exception.getStatus();
  switch (statusCode) {
    case 401:
      return {
        statusCode,
        reasonCode: REASON_CODES.AUTH_UNAUTHORIZED,
        message: 'Authentication failed',
        requestId,
      };
    case 403:
      return {
        statusCode,
        reasonCode: REASON_CODES.PERMISSION_DENIED,
        message: 'Request could not be authorized',
        requestId,
      };
    case 404:
      return {
        statusCode,
        reasonCode: REASON_CODES.RESOURCE_NOT_FOUND,
        message: 'Resource was not found',
        requestId,
      };
    case 409:
      return {
        statusCode,
        reasonCode: REASON_CODES.RESOURCE_STATE_CONFLICT,
        message: 'Request could not be completed',
        requestId,
      };
    case 422:
      return {
        statusCode,
        reasonCode: REASON_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        requestId,
        metadata: sanitizeValidationMetadata(exception.getResponse()),
      };
    case 429:
      return {
        statusCode,
        reasonCode: REASON_CODES.AUTH_RATE_LIMITED,
        message: 'Too many requests',
        requestId,
      };
    case 400:
      return {
        statusCode,
        reasonCode: REASON_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        requestId,
        metadata: sanitizeValidationMetadata(exception.getResponse()),
      };
    default:
      return {
        statusCode,
        reasonCode: REASON_CODES.INTERNAL_ERROR,
        message: 'Request failed',
        requestId,
      };
  }
}

function sanitizeValidationMetadata(response: unknown): unknown {
  if (Array.isArray(response)) {
    return { issues: response.map(String) };
  }

  if (response && typeof response === 'object') {
    const candidate = response as {
      message?: string | string[];
      error?: string;
    };
    const issues = Array.isArray(candidate.message)
      ? candidate.message.map(String)
      : typeof candidate.message === 'string'
        ? [candidate.message]
        : [];
    return {
      issues,
      error: typeof candidate.error === 'string' ? candidate.error : undefined,
    };
  }

  return undefined;
}
