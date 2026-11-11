import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { ExceptionHelper } from './exception.helper';

const thrownBy = (raise: () => never): RpcException => {
  try {
    raise();
  } catch (error) {
    if (error instanceof RpcException) {
      return error;
    }
    throw error;
  }
  throw new Error('nothing was thrown');
};

describe('ExceptionHelper', () => {
  it('throws a not found RpcException with the contract error body', () => {
    const exception = thrownBy(() => ExceptionHelper.notFound(ErrorCodeEnum.ROOM_NOT_FOUND, 'x'));

    expect(exception.getError()).toEqual({ statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message: 'x' });
  });

  it.each([
    ['badRequest', ErrorCodeEnum.VALIDATION, 400],
    ['conflict', ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS, 409],
    ['unprocessable', ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED, 422],
    ['serviceUnavailable', ErrorCodeEnum.SERVICE_UNAVAILABLE, 503],
  ] as const)('%s answers %s with status %i', (method, errorCode, statusCode) => {
    const exception = thrownBy(() => ExceptionHelper[method](errorCode, 'reason'));

    expect(exception.getError()).toEqual({ statusCode, errorCode, message: 'reason' });
  });
});
