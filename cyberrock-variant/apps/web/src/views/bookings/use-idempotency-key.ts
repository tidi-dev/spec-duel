import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';

type IssuedKey = {
  key: string;
  payload: string;
};

const FIRST_SERVER_ERROR_STATUS = 500;

const isFinalAnswer = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.statusCode < FIRST_SERVER_ERROR_STATUS &&
  error.errorCode !== ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS;

export function useIdempotencyKey() {
  const issued = useRef<IssuedKey | null>(null);

  const keyFor = useCallback((payload: object): string => {
    const serialized = JSON.stringify(payload);
    if (issued.current?.payload !== serialized) issued.current = { key: uuidv4(), payload: serialized };
    return issued.current.key;
  }, []);

  const settle = useCallback((error?: unknown): void => {
    if (error === undefined || isFinalAnswer(error)) issued.current = null;
  }, []);

  return { keyFor, settle };
}
