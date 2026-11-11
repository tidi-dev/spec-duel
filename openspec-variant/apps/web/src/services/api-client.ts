import axios from 'axios';
import type { ErrorResponseDto } from '@roombook/contract';
import { ApiError } from './api-error';

export const apiClient = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.response) throw error;
  const body = error.response.data as Partial<ErrorResponseDto> | undefined;
  throw new ApiError({
    statusCode: error.response.status,
    errorCode: body?.errorCode ?? '',
    message: body?.message ?? error.message,
  });
});
