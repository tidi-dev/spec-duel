import { ClientProxy, RpcException } from '@nestjs/microservices';
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception';
import { ErrorCodeEnum } from '@roombook/contract';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { NatsRequestUtil } from './nats-request.util';

const clientReturning = (result: Observable<unknown>): { client: ClientProxy; send: jest.Mock } => {
  const send = jest.fn().mockReturnValue(result);
  return { client: { send } as unknown as ClientProxy, send };
};

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error) => error,
  );

describe('NatsRequestUtil.send', () => {
  afterEach(() => jest.useRealTimers());

  it('resolves with the reply of the pattern', async () => {
    const { client, send } = clientReturning(of({ status: 'ok' }));

    await expect(NatsRequestUtil.send(client, 'health:room', {})).resolves.toEqual({ status: 'ok' });
    expect(send).toHaveBeenCalledWith('health:room', {});
  });

  it('rejects with a 503 once the reply takes longer than 5 seconds, without retrying', async () => {
    jest.useFakeTimers();
    const { client, send } = clientReturning(NEVER);

    const pending = errorOf(NatsRequestUtil.send(client, 'health:room', {}));
    jest.advanceTimersByTime(5000);
    const error = await pending;

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects with a 503 when no service listens to the pattern', async () => {
    const { client } = clientReturning(throwError(() => new EmptyResponseException('health:room')));

    const error = await errorOf(NatsRequestUtil.send(client, 'health:room', {}));

    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
    );
  });

  it('passes a domain error from the service through unchanged', async () => {
    const domainError = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'x' };
    const { client } = clientReturning(throwError(() => domainError));

    await expect(NatsRequestUtil.send(client, 'room:findRoomById', { id: 'x' })).rejects.toBe(domainError);
  });
});
