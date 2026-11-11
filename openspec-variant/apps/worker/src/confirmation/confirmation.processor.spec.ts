import { Test } from '@nestjs/testing';
import { ConfirmationJobDto } from '@roombook/contract';
import { Job } from 'bullmq';
import { ConfirmationProcessor } from './confirmation.processor';
import { ConfirmationService } from './confirmation.service';

describe('ConfirmationProcessor', () => {
  const bookingId = '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f';
  const jobWith = (attemptsMade: number): Job<ConfirmationJobDto> =>
    ({ data: { bookingId }, attemptsMade }) as Job<ConfirmationJobDto>;
  let processor: ConfirmationProcessor;
  let confirm: jest.Mock;

  beforeEach(async () => {
    confirm = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [ConfirmationProcessor, { provide: ConfirmationService, useValue: { confirm } }],
    }).compile();
    processor = moduleRef.get(ConfirmationProcessor);
  });

  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
  ])('delegates a job with %i attempts made as attempt %i', async (attemptsMade, attempt) => {
    await expect(processor.process(jobWith(attemptsMade))).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledWith(bookingId, attempt);
  });

  it('rejects when the confirmation was not delivered, so BullMQ retries or fails the job', async () => {
    confirm.mockRejectedValue(new Error('not delivered'));

    await expect(processor.process(jobWith(0))).rejects.toThrow('not delivered');
  });
});
