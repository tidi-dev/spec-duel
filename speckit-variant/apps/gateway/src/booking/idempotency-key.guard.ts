import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum, IDEMPOTENCY_KEY_HEADER } from '@roombook/contract';
import { isUUID } from 'class-validator';
import { IncomingMessage } from 'node:http';

@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    return (
      isUUID(request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]) ||
      ExceptionHelper.badRequest(ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID, 'Idempotency-Key header must be a UUID')
    );
  }
}
