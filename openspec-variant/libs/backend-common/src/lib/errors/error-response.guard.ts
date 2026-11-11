import { ErrorResponseDto } from '@roombook/contract';

export const isErrorResponse = (value: unknown): value is ErrorResponseDto => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['statusCode'] === 'number' &&
    typeof candidate['errorCode'] === 'string' &&
    typeof candidate['message'] === 'string'
  );
};
