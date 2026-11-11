import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { confirmationJobId, QueueEnum } from '@roombook/contract';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { BOOKING_ID } from './testing/booking.fixture';

describe('ConfirmationQueueProducer', () => {
  let producer: ConfirmationQueueProducer;
  let add: jest.Mock;

  beforeEach(async () => {
    add = jest.fn().mockResolvedValue({ id: confirmationJobId(BOOKING_ID) });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfirmationQueueProducer,
        { provide: getQueueToken(QueueEnum.BOOKING_CONFIRMATION), useValue: { add } },
      ],
    }).compile();
    producer = moduleRef.get(ConfirmationQueueProducer);
  });

  afterEach(() => jest.restoreAllMocks());

  it('adds one job per booking with the contract job id and retry policy', async () => {
    await producer.enqueue(BOOKING_ID);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      QueueEnum.BOOKING_CONFIRMATION,
      { bookingId: BOOKING_ID },
      { jobId: `confirmation-${BOOKING_ID}`, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
  });

  it('logs a rejected add and does not rethrow it', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    add.mockRejectedValue(new Error('redis is down'));

    await expect(producer.enqueue(BOOKING_ID)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(BOOKING_ID), expect.anything());
  });
});
