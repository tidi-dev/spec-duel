import type { ErrorResponseDto } from '@roombook/contract';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor({ statusCode, errorCode, message }: ErrorResponseDto) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
