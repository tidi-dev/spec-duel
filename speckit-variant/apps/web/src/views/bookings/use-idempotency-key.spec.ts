import { renderHook } from '@testing-library/react';
import { validate, version } from 'uuid';
import { useIdempotencyKey } from './use-idempotency-key';

describe('useIdempotencyKey', () => {
  it('returns a UUID v4 and the same value on every call until release', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());

    const first = result.current.getKey();
    rerender();

    expect(validate(first)).toBe(true);
    expect(version(first)).toBe(4);
    expect(result.current.getKey()).toBe(first);
    expect(result.current.getKey()).toBe(first);
  });

  it('returns a different UUID after release', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current.getKey();

    result.current.release();
    const second = result.current.getKey();

    expect(validate(second)).toBe(true);
    expect(version(second)).toBe(4);
    expect(second).not.toBe(first);
    expect(result.current.getKey()).toBe(second);
  });
});
