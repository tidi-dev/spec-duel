import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  CONFIRMATION_BACKOFF_MS,
  CONFIRMATION_JOB_ATTEMPTS,
  ConfirmationJobDto,
  confirmationJobId,
  QueueEnum,
} from '@roombook/contract';
import { Queue } from 'bullmq';
import { from, lastValueFrom, timeout } from 'rxjs';

export const CONFIRMATION_ENQUEUE_TIMEOUT_MS = 2000;

@Injectable()
export class ConfirmationQueueProducer {
  private readonly logger = new Logger(ConfirmationQueueProducer.name);

  constructor(
    @InjectQueue(QueueEnum.BOOKING_CONFIRMATION) private readonly queue: Queue<ConfirmationJobDto>,
  ) {}

  async enqueue(bookingId: string): Promise<void> {
    try {
      const added = this.queue.add(
        QueueEnum.BOOKING_CONFIRMATION,
        { bookingId },
        {
          jobId: confirmationJobId(bookingId),
          attempts: CONFIRMATION_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS },
        },
      );
      await lastValueFrom(from(added).pipe(timeout(CONFIRMATION_ENQUEUE_TIMEOUT_MS)));
    } catch (error) {
      this.logger.error(`Confirmation job for booking ${bookingId} was not enqueued: ${String(error)}`);
    }
  }
}
