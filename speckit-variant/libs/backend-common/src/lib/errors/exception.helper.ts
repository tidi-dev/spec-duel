import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum, ErrorResponseDto } from '@roombook/contract';

export class ExceptionHelper {
  static badRequest(errorCode: ErrorCodeEnum, message: string): never {
    return ExceptionHelper.raise(HttpStatus.BAD_REQUEST, errorCode, message);
  }

  static notFound(errorCode: ErrorCodeEnum, message: string): never {
    return ExceptionHelper.raise(HttpStatus.NOT_FOUND, errorCode, message);
  }

  static conflict(errorCode: ErrorCodeEnum, message: string): never {
    return ExceptionHelper.raise(HttpStatus.CONFLICT, errorCode, message);
  }

  static unprocessable(errorCode: ErrorCodeEnum, message: string): never {
    return ExceptionHelper.raise(HttpStatus.UNPROCESSABLE_ENTITY, errorCode, message);
  }

  static serviceUnavailable(errorCode: ErrorCodeEnum, message: string): never {
    return ExceptionHelper.raise(HttpStatus.SERVICE_UNAVAILABLE, errorCode, message);
  }

  private static raise(statusCode: HttpStatus, errorCode: ErrorCodeEnum, message: string): never {
    const error: ErrorResponseDto = { statusCode, errorCode, message };
    throw new RpcException(error);
  }
}
