import { ArgumentsHost, BadRequestException, HttpServer, Logger, NotFoundException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { RpcExceptionFilter } from './rpc-exception.filter';

describe('RpcExceptionFilter', () => {
  const response = { kind: 'response' };
  const host = {
    getArgByIndex: (): unknown => response,
    switchToHttp: () => ({ getResponse: (): unknown => response }),
  } as unknown as ArgumentsHost;
  let reply: jest.Mock;
  let filter: RpcExceptionFilter;

  beforeEach(() => {
    reply = jest.fn();
    const adapter = { reply, isHeadersSent: () => false, end: jest.fn() } as unknown as HttpServer;
    filter = new RpcExceptionFilter(adapter);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('answers the status and body of a domain RpcException', () => {
    const body = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'x' };

    filter.catch(new RpcException(body), host);

    expect(reply).toHaveBeenCalledWith(response, body, 404);
  });

  it('answers a domain error relayed from a service as a plain object', () => {
    const body = { statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'down' };

    filter.catch(body, host);

    expect(reply).toHaveBeenCalledWith(response, body, 503);
  });

  it('answers a validation failure with 400 and the validation error code', () => {
    filter.catch(new BadRequestException(['page must not be less than 1', 'limit must be an integer']), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 400,
        errorCode: ErrorCodeEnum.VALIDATION,
        message: 'page must not be less than 1, limit must be an integer',
      },
      400,
    );
  });

  it('keeps the status of any other HTTP exception', () => {
    filter.catch(new NotFoundException('Cannot GET /api/unknown'), host);

    expect(reply).toHaveBeenCalledWith(response, expect.objectContaining({ statusCode: 404 }), 404);
  });

  it('answers 500 for a plain Error', () => {
    filter.catch(new Error('boom'), host);

    expect(reply).toHaveBeenCalledWith(response, expect.objectContaining({ statusCode: 500 }), 500);
  });

  it('answers 500 for an unknown error relayed from a service', () => {
    filter.catch({ status: 'error', message: 'Internal server error' }, host);

    expect(reply).toHaveBeenCalledWith(response, expect.objectContaining({ statusCode: 500 }), 500);
  });
});
