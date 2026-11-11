import { ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { IdempotencyKeyGuard } from './idempotency-key.guard';

const contextWithHeaders = (headers: Record<string, string>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

const errorOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error instanceof RpcException ? error.getError() : error;
  }
  return undefined;
};

describe('IdempotencyKeyGuard', () => {
  const guard = new IdempotencyKeyGuard();

  it('allows a request whose idempotency key is a UUID', () => {
    const context = contextWithHeaders({ 'idempotency-key': '5d3c8a44-2f0e-4b7a-9c1d-6e8f0a1b2c3d' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([
    ['a missing header', {}],
    ['the value abc', { 'idempotency-key': 'abc' }],
  ])('raises 400 for %s', (_case, headers) => {
    expect(errorOf(() => guard.canActivate(contextWithHeaders(headers)))).toEqual({
      statusCode: 400,
      errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID,
      message: 'Idempotency-Key header must be a UUID',
    });
  });
});
