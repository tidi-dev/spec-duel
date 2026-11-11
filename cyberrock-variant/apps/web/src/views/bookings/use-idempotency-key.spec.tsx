import { act, renderHook } from '@testing-library/react';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { useIdempotencyKey } from './use-idempotency-key';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const payload = { title: 'Sprint planning', startsAt: '2030-01-07T09:00:00.000Z' };

const apiError = (statusCode: number, errorCode: ErrorCodeEnum) =>
  new ApiError({ statusCode, errorCode, message: 'failed' });

const setup = () => renderHook(() => useIdempotencyKey()).result;

describe('useIdempotencyKey (BPG-006, R-14)', () => {
  it('issues a UUID', () => {
    expect(setup().current.keyFor(payload)).toMatch(UUID_PATTERN);
  });

  it('keeps the key for the retry of an unchanged payload after a 503', () => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle(apiError(503, ErrorCodeEnum.SERVICE_UNAVAILABLE)));

    expect(hook.current.keyFor({ ...payload })).toBe(first);
  });

  it('keeps the key after a network error', () => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle(new Error('Network Error')));

    expect(hook.current.keyFor(payload)).toBe(first);
  });

  it('keeps the key after a 409 in-progress answer', () => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle(apiError(409, ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS)));

    expect(hook.current.keyFor(payload)).toBe(first);
  });

  it('issues a new key when the payload was edited after a 503', () => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle(apiError(503, ErrorCodeEnum.SERVICE_UNAVAILABLE)));

    const second = hook.current.keyFor({ ...payload, title: 'Retro' });

    expect(second).toMatch(UUID_PATTERN);
    expect(second).not.toBe(first);
  });

  it('drops the key after a 201', () => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle());

    expect(hook.current.keyFor(payload)).not.toBe(first);
  });

  it.each([
    [400, ErrorCodeEnum.VALIDATION],
    [404, ErrorCodeEnum.ROOM_NOT_FOUND],
    [422, ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED],
  ])('drops the key after a final %i answer', (statusCode, errorCode) => {
    const hook = setup();
    const first = hook.current.keyFor(payload);
    act(() => hook.current.settle(apiError(statusCode, errorCode)));

    expect(hook.current.keyFor(payload)).not.toBe(first);
  });

  it('keeps the key across re-renders', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current.keyFor(payload);
    rerender();

    expect(result.current.keyFor(payload)).toBe(first);
  });
});
