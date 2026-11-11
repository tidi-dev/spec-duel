import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { ErrorCodeEnum, HealthPatternEnum } from '@roombook/contract';
import { NEVER, of } from 'rxjs';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let send: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: NATS_CLIENT, useValue: { send } as unknown as ClientProxy }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['booking', HealthPatternEnum.BOOKING],
    ['room', HealthPatternEnum.ROOM],
    ['worker', HealthPatternEnum.WORKER],
  ] as const)('proxies the %s health check to its pattern', async (service, pattern) => {
    send.mockReturnValue(of({ status: 'ok', service }));

    await expect(controller[service]()).resolves.toEqual({ status: 'ok', service });
    expect(send).toHaveBeenCalledWith(pattern, {});
  });

  it('answers 503 when the service does not reply within the timeout', async () => {
    jest.useFakeTimers();
    send.mockReturnValue(NEVER);

    const pending = controller.room().then(
      () => undefined,
      (error: unknown) => error,
    );
    jest.advanceTimersByTime(5000);
    const error = await pending;

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
    );
  });
});
