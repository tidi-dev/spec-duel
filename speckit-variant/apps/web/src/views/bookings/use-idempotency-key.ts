import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

type IdempotencyKey = {
  getKey: () => string;
  release: () => void;
};

export function useIdempotencyKey(): IdempotencyKey {
  const keyRef = useRef<string | null>(null);

  const getKey = useCallback((): string => {
    keyRef.current ??= uuidv4();
    return keyRef.current;
  }, []);

  const release = useCallback((): void => {
    keyRef.current = null;
  }, []);

  return { getKey, release };
}
