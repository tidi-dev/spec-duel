import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ErrorCodeEnum } from '@roombook/contract';
import type { ErrorResponseDto } from '@roombook/contract';
import { apiClient } from './api-client';
import { ApiError } from './api-error';

const rejectingAdapter = (status: number, data: unknown) => (config: InternalAxiosRequestConfig) =>
  Promise.reject(
    new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, null, {
      status,
      statusText: '',
      data,
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    }),
  );

describe('apiClient', () => {
  it('takes its base URL from NEXT_PUBLIC_API_URL', async () => {
    const original = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test/api';

    await jest.isolateModulesAsync(async () => {
      const { apiClient: freshClient } = await import('./api-client');
      expect(freshClient.defaults.baseURL).toBe('http://api.test/api');
    });

    if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = original;
  });

  it('turns an error response into an ApiError carrying the contract fields', async () => {
    const body: ErrorResponseDto = {
      statusCode: 404,
      errorCode: ErrorCodeEnum.ROOM_NOT_FOUND,
      message: 'Room not found',
    };

    const failure = await apiClient.get('/rooms/x', { adapter: rejectingAdapter(404, body) }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject(body);
  });

  it('rethrows an error that has no response', async () => {
    const networkError = new AxiosError('Network Error', AxiosError.ERR_NETWORK);

    const failure = await apiClient
      .get('/rooms', { adapter: () => Promise.reject(networkError) })
      .catch((e: unknown) => e);

    expect(failure).toBe(networkError);
  });
});
