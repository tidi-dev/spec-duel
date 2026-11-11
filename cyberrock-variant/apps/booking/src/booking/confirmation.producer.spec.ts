import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ErrorCodeEnum, QueueEnum } from '@roombook/contract';
import { ConfirmationProducer } from './confirmation.producer';

const BOOKING_ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';

const outcomeOf = (promise: Promise<void>): Promise<unknown> =>
  promise.then(
    () => 'enqueued',
    (error: unknown) => error,
  );

const expectUnavailable = (error: unknown): void => {
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toEqual(
    expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
  );
};

describe('ConfirmationProducer', () => {
  let producer: ConfirmationProducer;
  let add: jest.Mock;
  let logError: jest.SpyInstance;

  beforeEach(async () => {
    add = jest.fn().mockResolvedValue({ id: `confirmation-${BOOKING_ID}` });
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfirmationProducer,
        { provide: getQueueToken(QueueEnum.BOOKING_CONFIRMATION), useValue: { add } },
      ],
    }).compile();
    producer = moduleRef.get(ConfirmationProducer);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('adds one job with the booking id, a stable job id and three attempts with backoff (CNF-001)', async () => {
    await expect(outcomeOf(producer.enqueue(BOOKING_ID))).resolves.toBe('enqueued');

    expect(add).toHaveBeenCalledTimes(1);
    const [, payload, options] = add.mock.calls[0];
    expect(payload).toEqual({ bookingId: BOOKING_ID });
    expect(options).toEqual({
      jobId: `confirmation-${BOOKING_ID}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps finished and failed jobs, so the job id keeps blocking a second job (R-07)', async () => {
    await producer.enqueue(BOOKING_ID);

    expect(add.mock.calls[0][2]).toEqual(expect.objectContaining({ removeOnComplete: false, removeOnFail: false }));
  });

  it('answers 503 and logs when the queue rejects (CNF-003, R-03)', async () => {
    add.mockRejectedValue(new Error('ECONNREFUSED'));

    expectUnavailable(await outcomeOf(producer.enqueue(BOOKING_ID)));
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toEqual(expect.stringContaining(BOOKING_ID));
    expect(logError.mock.calls[0][0]).toEqual(expect.stringContaining('ECONNREFUSED'));
  });

  it('answers 503 and logs once the queue has not settled for 2000 ms (CNF-003, R-03)', async () => {
    jest.useFakeTimers();
    add.mockReturnValue(new Promise(() => undefined));
    let outcome: unknown = 'pending';

    const settled = outcomeOf(producer.enqueue(BOOKING_ID)).then((value) => {
      outcome = value;
    });
    await jest.advanceTimersByTimeAsync(1999);
    expect(outcome).toBe('pending');
    await jest.advanceTimersByTimeAsync(1);
    await settled;

    expectUnavailable(outcome);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toEqual(expect.stringContaining(BOOKING_ID));
  });

  it('adds the same job id again on a retry, which is the recovery path (CNF-002, CNF-003)', async () => {
    add.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expectUnavailable(await outcomeOf(producer.enqueue(BOOKING_ID)));
    await expect(outcomeOf(producer.enqueue(BOOKING_ID))).resolves.toBe('enqueued');

    expect(add.mock.calls[0][2].jobId).toBe(`confirmation-${BOOKING_ID}`);
    expect(add.mock.calls[1][2].jobId).toBe(`confirmation-${BOOKING_ID}`);
  });
});
