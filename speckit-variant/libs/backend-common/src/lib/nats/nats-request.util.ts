import { ClientProxy } from '@nestjs/microservices';
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception';
import { ErrorCodeEnum } from '@roombook/contract';
import { catchError, lastValueFrom, throwError, timeout, TimeoutError } from 'rxjs';
import { ExceptionHelper } from '../errors/exception.helper';

export const NATS_REQUEST_TIMEOUT_MS = 5000;

const isUnanswered = (error: unknown): boolean =>
  error instanceof TimeoutError || error instanceof EmptyResponseException;

export class NatsRequestUtil {
  static send<TResult, TInput>(client: ClientProxy, pattern: string, data: TInput): Promise<TResult> {
    return lastValueFrom(
      client.send<TResult, TInput>(pattern, data).pipe(
        timeout(NATS_REQUEST_TIMEOUT_MS),
        catchError((error: unknown) =>
          isUnanswered(error)
            ? ExceptionHelper.serviceUnavailable(ErrorCodeEnum.SERVICE_UNAVAILABLE, `No service answered ${pattern}`)
            : throwError(() => error),
        ),
      ),
    );
  }
}
