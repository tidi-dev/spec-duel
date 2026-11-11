import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CONFIRMATION_BACKOFF_MS,
  CONFIRMATION_JOB_ATTEMPTS,
  confirmationJobId,
  QueueEnum,
} from '@roombook/contract';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';

const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';

describe('ConfirmationQueueProducer', () => {
  let producer: ConfirmationQueueProducer;
  let add: jest.Mock;
  let logError: jest.SpyInstance;

  beforeEach(async () => {
    add = jest.fn().mockResolvedValue({ id: confirmationJobId(BOOKING_ID) });
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfirmationQueueProducer,
        { provide: getQueueToken(QueueEnum.BOOKING_CONFIRMATION), useValue: { add } },
      ],
    }).compile();
    producer = moduleRef.get(ConfirmationQueueProducer);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('adds one job with the contract job id, attempts and backoff and keeps finished jobs', async () => {
    await producer.enqueue(BOOKING_ID);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      QueueEnum.BOOKING_CONFIRMATION,
      { bookingId: BOOKING_ID },
      {
        jobId: confirmationJobId(BOOKING_ID),
        attempts: CONFIRMATION_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS },
      },
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs and resolves when the queue rejects the job', async () => {
    add.mockRejectedValue(new Error('Connection is closed.'));

    await expect(producer.enqueue(BOOKING_ID)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('logs and resolves when the queue does not settle within 2 seconds', async () => {
    jest.useFakeTimers();
    add.mockReturnValue(new Promise(() => undefined));
    let settled = false;

    const pending = producer.enqueue(BOOKING_ID).then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(settled).toBe(true);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
