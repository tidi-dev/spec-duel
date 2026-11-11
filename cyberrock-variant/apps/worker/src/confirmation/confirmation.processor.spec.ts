import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { BookingPatternEnum, ConfirmationJobDto, ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { Job } from 'bullmq';
import { Observable, of, throwError } from 'rxjs';
import { ConfirmationProcessor } from './confirmation.processor';

const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const { PENDING, SENT, FAILED } = ConfirmationStatusEnum;
const NOT_FOUND = { statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'gone' };
const unavailable = (): RpcException =>
  new RpcException({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'down' });

const job = (attemptsMade: number): Job<ConfirmationJobDto> =>
  ({ data: { bookingId: ID }, attemptsMade }) as Job<ConfirmationJobDto>;

describe('ConfirmationProcessor', () => {
  let processor: ConfirmationProcessor;
  const send = jest.fn();
  let stored = { id: ID, organizerEmail: 'ann@example.com', confirmationStatus: PENDING, confirmationAttempts: 0 };

  const reports = (): unknown[] =>
    send.mock.calls.filter(([pattern]) => pattern === BookingPatternEnum.RECORD_CONFIRMATION).map(([, data]) => data);

  const answer = (read: () => Observable<unknown>, report: () => Observable<unknown>): void => {
    send.mockImplementation((pattern: string) => (pattern === BookingPatternEnum.FIND_BY_ID ? read() : report()));
  };

  const runAttempts = async (organizerEmail: string): Promise<string[]> => {
    stored = { ...stored, organizerEmail };
    const results: string[] = [];
    for (const attemptsMade of [0, 1, 2]) {
      results.push(
        await processor.process(job(attemptsMade)).then(
          () => 'completed',
          () => 'failed',
        ),
      );
      if (results[attemptsMade] === 'completed') {
        break;
      }
    }
    return results;
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    stored = { id: ID, organizerEmail: 'ann@example.com', confirmationStatus: PENDING, confirmationAttempts: 0 };
    answer(
      () => of(stored),
      () => of(stored),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [ConfirmationProcessor, { provide: NATS_CLIENT, useValue: { send } }],
    }).compile();
    processor = moduleRef.get(ConfirmationProcessor);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports SENT 1 for a plain address and completes (CNF-005)', async () => {
    await expect(runAttempts('ann@example.com')).resolves.toEqual(['completed']);

    expect(send).toHaveBeenNthCalledWith(1, BookingPatternEnum.FIND_BY_ID, { id: ID });
    expect(reports()).toEqual([{ bookingId: ID, status: SENT, attempts: 1 }]);
  });

  it('reports PENDING 1, PENDING 2, SENT 3 for a retry address, failing the first two runs (CNF-005)', async () => {
    await expect(runAttempts('ann@retry.example')).resolves.toEqual(['failed', 'failed', 'completed']);

    expect(reports()).toEqual([
      { bookingId: ID, status: PENDING, attempts: 1 },
      { bookingId: ID, status: PENDING, attempts: 2 },
      { bookingId: ID, status: SENT, attempts: 3 },
    ]);
  });

  it('reports PENDING 1, PENDING 2, FAILED 3 for a bounce address, failing every run (CNF-005)', async () => {
    await expect(runAttempts('ann@bounce.example')).resolves.toEqual(['failed', 'failed', 'failed']);

    expect(reports()).toEqual([
      { bookingId: ID, status: PENDING, attempts: 1 },
      { bookingId: ID, status: PENDING, attempts: 2 },
      { bookingId: ID, status: FAILED, attempts: 3 },
    ]);
  });

  it('CNF-007: completes without sending or reporting when the booking already reads SENT', async () => {
    stored = { ...stored, organizerEmail: 'ann@bounce.example', confirmationStatus: SENT, confirmationAttempts: 1 };

    await expect(processor.process(job(0))).resolves.toBeUndefined();

    expect(reports()).toEqual([]);
  });

  it('CNF-007: completes without reporting when the read answers 404 NOT_FOUND.BOOKING', async () => {
    answer(
      () => throwError(() => NOT_FOUND),
      () => of(stored),
    );

    await expect(processor.process(job(0))).resolves.toBeUndefined();

    expect(reports()).toEqual([]);
  });

  it('CNF-007: completes, even for a failed send, when the report answers 404 NOT_FOUND.BOOKING', async () => {
    stored = { ...stored, organizerEmail: 'ann@bounce.example' };
    answer(
      () => of(stored),
      () => throwError(() => NOT_FOUND),
    );

    await expect(processor.process(job(0))).resolves.toBeUndefined();

    expect(reports()).toEqual([{ bookingId: ID, status: PENDING, attempts: 1 }]);
  });

  it('fails the job for a retry when the read answers 503, without reporting (CNF-007)', async () => {
    const down = unavailable();
    answer(
      () => throwError(() => down),
      () => of(stored),
    );

    await expect(processor.process(job(0))).rejects.toBe(down);
    expect(reports()).toEqual([]);
  });

  it('fails the job for a retry and logs when the report answers 503 (CNF-007)', async () => {
    const down = unavailable();
    answer(
      () => of(stored),
      () => throwError(() => down),
    );

    await expect(processor.process(job(0))).rejects.toBe(down);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining(ID));
  });

  it('fails the job on any other error of the read, such as another 404 (CNF-007)', async () => {
    const other = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'x' };
    answer(
      () => throwError(() => other),
      () => of(stored),
    );

    await expect(processor.process(job(0))).rejects.toBe(other);
  });
});
