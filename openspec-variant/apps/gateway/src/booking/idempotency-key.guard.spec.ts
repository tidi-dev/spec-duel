import { ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { IdempotencyKeyGuard } from './idempotency-key.guard';

const contextWith = (headers: Record<string, string | string[]>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

const errorOf = (action: () => unknown): unknown => {
  try {
    action();
  } catch (error) {
    return error instanceof RpcException ? error.getError() : error;
  }
  return undefined;
};

describe('IdempotencyKeyGuard', () => {
  const guard = new IdempotencyKeyGuard();
  const invalidKey = expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID });

  it('lets a request with a UUID key through', () => {
    expect(guard.canActivate(contextWith({ 'idempotency-key': '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d' }))).toBe(true);
  });

  it('raises 400 BAD_REQUEST.IDEMPOTENCY_KEY when the header is missing', () => {
    expect(errorOf(() => guard.canActivate(contextWith({})))).toEqual(invalidKey);
  });

  it.each([
    ['is not a UUID', 'abc'],
    ['is empty', ''],
    ['was sent twice', ['0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d', '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d']],
  ])('raises 400 BAD_REQUEST.IDEMPOTENCY_KEY when the header %s', (_case, value) => {
    expect(errorOf(() => guard.canActivate(contextWith({ 'idempotency-key': value })))).toEqual(invalidKey);
  });
});
