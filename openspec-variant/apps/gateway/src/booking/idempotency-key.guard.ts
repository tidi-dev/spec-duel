import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum, IDEMPOTENCY_KEY_HEADER } from '@roombook/contract';
import { isUUID } from 'class-validator';
import { IncomingMessage } from 'http';

@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const key = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    if (!isUUID(key)) {
      ExceptionHelper.badRequest(
        ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID,
        `The ${IDEMPOTENCY_KEY_HEADER} header is required and must be a UUID`,
      );
    }
    return true;
  }
}
