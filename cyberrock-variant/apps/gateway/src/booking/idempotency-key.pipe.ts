import { createParamDecorator, ExecutionContext, Injectable, PipeTransform } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum, IDEMPOTENCY_KEY_HEADER } from '@roombook/contract';
import { isUUID } from 'class-validator';
import { IncomingMessage } from 'http';

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    return typeof value === 'string' && isUUID(value)
      ? value
      : ExceptionHelper.badRequest(
          ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID,
          `${IDEMPOTENCY_KEY_HEADER} header must be a UUID`,
        );
  }
}

// Runs at extraction, not as a parameter pipe: Nest resolves pipes concurrently and the body could answer first.
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  new IdempotencyKeyPipe().transform(
    context.switchToHttp().getRequest<IncomingMessage>().headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()],
  ),
);
