import { Test } from '@nestjs/testing';
import { ConfirmationJobDto } from '@roombook/contract';
import { Job } from 'bullmq';
import { ConfirmationProcessor } from './confirmation.processor';
import { ConfirmationService } from './confirmation.service';

const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';

const jobWithAttemptsMade = (attemptsMade: number): Job<ConfirmationJobDto> =>
  ({ data: { bookingId: BOOKING_ID }, attemptsMade }) as unknown as Job<ConfirmationJobDto>;

describe('ConfirmationProcessor', () => {
  let processor: ConfirmationProcessor;
  let processAttempt: jest.Mock;

  beforeEach(async () => {
    processAttempt = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [ConfirmationProcessor, { provide: ConfirmationService, useValue: { processAttempt } }],
    }).compile();
    processor = moduleRef.get(ConfirmationProcessor);
  });

  it.each([
    [0, 1],
    [2, 3],
  ])('processes a job with %i attempts made as attempt %i', async (attemptsMade, attempt) => {
    await expect(processor.process(jobWithAttemptsMade(attemptsMade))).resolves.toBeUndefined();

    expect(processAttempt).toHaveBeenCalledWith(BOOKING_ID, attempt);
  });

  it('propagates a failed attempt so the queue retries or fails the job', async () => {
    const failure = new Error('Confirmation attempt 1 failed');
    processAttempt.mockRejectedValue(failure);

    await expect(processor.process(jobWithAttemptsMade(0))).rejects.toBe(failure);
  });
});
