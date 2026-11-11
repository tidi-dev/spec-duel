import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';

const K1 = '11111111-1111-4111-8111-111111111111';

describe('IdempotencyKeyPipe (IDM-001)', () => {
  const pipe = new IdempotencyKeyPipe();

  it.each([K1, K1.toUpperCase(), '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10'])('passes the UUID %s through unchanged', (key) => {
    expect(pipe.transform(key)).toBe(key);
  });

  it.each([
    ['an absent header', undefined],
    ['an empty header', ''],
    ['a blank header', ' '],
    ['a malformed value', 'abc'],
    ['a UUID without dashes', '11111111111141118111111111111111'],
    ['a UUID with a trailing character', `${K1}0`],
    ['a UUID in braces', `{${K1}}`],
    ['a repeated header', [K1, K1]],
    ['null', null],
  ])('rejects %s with 400 BAD_REQUEST.IDEMPOTENCY_KEY', (_case, value) => {
    let caught: unknown;
    try {
      pipe.transform(value);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RpcException);
    expect((caught as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID }),
    );
  });
});
