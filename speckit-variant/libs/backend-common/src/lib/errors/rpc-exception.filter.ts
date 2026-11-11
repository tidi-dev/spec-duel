import { ArgumentsHost, BadRequestException, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum, ErrorResponseDto } from '@roombook/contract';
import { isErrorResponse } from './error-response.guard';

const validationMessage = (exception: BadRequestException): string => {
  const response = exception.getResponse();
  const message = typeof response === 'object' ? (response as Record<string, unknown>)['message'] : response;
  return Array.isArray(message) ? message.join(', ') : String(message);
};

@Catch()
export class RpcExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toErrorResponse(exception);
    if (!body) {
      return super.catch(exception, host);
    }
    const httpAdapter = this.applicationRef ?? this.httpAdapterHost?.httpAdapter;
    httpAdapter?.reply(host.switchToHttp().getResponse(), body, body.statusCode);
  }

  private toErrorResponse(exception: unknown): ErrorResponseDto | null {
    const error = exception instanceof RpcException ? exception.getError() : exception;
    if (isErrorResponse(error)) {
      return { statusCode: error.statusCode, errorCode: error.errorCode, message: error.message };
    }
    if (exception instanceof BadRequestException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodeEnum.VALIDATION,
        message: validationMessage(exception),
      };
    }
    return null;
  }
}
