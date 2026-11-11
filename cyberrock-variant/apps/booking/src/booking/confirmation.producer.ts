import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import {
  CONFIRMATION_BACKOFF_MS,
  CONFIRMATION_JOB_ATTEMPTS,
  ConfirmationJobDto,
  confirmationJobId,
  ErrorCodeEnum,
  QueueEnum,
} from '@roombook/contract';
import { Queue } from 'bullmq';
import { from, lastValueFrom, timeout } from 'rxjs';

export const CONFIRMATION_ENQUEUE_TIMEOUT_MS = 2000;

@Injectable()
export class ConfirmationProducer {
  private readonly logger = new Logger(ConfirmationProducer.name);

  constructor(@InjectQueue(QueueEnum.BOOKING_CONFIRMATION) private readonly queue: Queue<ConfirmationJobDto>) {}

  async enqueue(bookingId: string): Promise<void> {
    const adding = this.queue.add(
      QueueEnum.BOOKING_CONFIRMATION,
      { bookingId },
      {
        jobId: confirmationJobId(bookingId),
        attempts: CONFIRMATION_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS },
        // Kept by decision: the job id of a finished job is what blocks a second job for the booking.
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    try {
      await lastValueFrom(from(adding).pipe(timeout(CONFIRMATION_ENQUEUE_TIMEOUT_MS)));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Confirmation job for booking ${bookingId} was not enqueued: ${reason}`);
      ExceptionHelper.serviceUnavailable(ErrorCodeEnum.SERVICE_UNAVAILABLE, 'Confirmation queue is unavailable');
    }
  }
}
