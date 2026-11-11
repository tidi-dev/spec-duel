import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfirmationJobDto, QueueEnum } from '@roombook/contract';
import { Job } from 'bullmq';
import { ConfirmationService } from './confirmation.service';

@Processor(QueueEnum.BOOKING_CONFIRMATION)
export class ConfirmationProcessor extends WorkerHost {
  constructor(private readonly confirmationService: ConfirmationService) {
    super();
  }

  process(job: Job<ConfirmationJobDto>): Promise<void> {
    return this.confirmationService.processAttempt(job.data.bookingId, job.attemptsMade + 1);
  }
}
