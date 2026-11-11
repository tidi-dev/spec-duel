import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import {
  BookingDto,
  BookingIdMessageDto,
  BookingPatternEnum,
  CONFIRMATION_JOB_ATTEMPTS,
  ConfirmationJobDto,
  ConfirmationStatusEnum,
  ErrorCodeEnum,
  QueueEnum,
  RecordConfirmationResultDto,
} from '@roombook/contract';
import { Job } from 'bullmq';
import { simulateConfirmationSend } from './simulated-confirmation-sender';

const isBookingNotFound = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as Record<string, unknown>)['errorCode'] === ErrorCodeEnum.BOOKING_NOT_FOUND;

const statusOf = (sent: boolean, attempt: number): ConfirmationStatusEnum => {
  if (sent) {
    return ConfirmationStatusEnum.SENT;
  }
  return attempt < CONFIRMATION_JOB_ATTEMPTS ? ConfirmationStatusEnum.PENDING : ConfirmationStatusEnum.FAILED;
};

@Processor(QueueEnum.BOOKING_CONFIRMATION)
export class ConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(ConfirmationProcessor.name);

  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  async process(job: Job<ConfirmationJobDto>): Promise<void> {
    const { bookingId } = job.data;
    const attempt = job.attemptsMade + 1;
    const booking = await this.readBooking(bookingId);
    if (!booking || booking.confirmationStatus === ConfirmationStatusEnum.SENT) {
      return;
    }
    const sent = simulateConfirmationSend(booking.organizerEmail, attempt);
    const recorded = await this.report({ bookingId, status: statusOf(sent, attempt), attempts: attempt });
    if (recorded && !sent) {
      throw new Error(`Confirmation for booking ${bookingId} was not sent on attempt ${attempt}`);
    }
  }

  private readBooking(bookingId: string): Promise<BookingDto | null> {
    return NatsRequestUtil.send<BookingDto, BookingIdMessageDto>(this.client, BookingPatternEnum.FIND_BY_ID, {
      id: bookingId,
    }).catch((error: unknown) => {
      if (isBookingNotFound(error)) {
        return null;
      }
      throw error;
    });
  }

  private report(result: RecordConfirmationResultDto): Promise<BookingDto | null> {
    return NatsRequestUtil.send<BookingDto, RecordConfirmationResultDto>(
      this.client,
      BookingPatternEnum.RECORD_CONFIRMATION,
      result,
    ).catch((error: unknown) => {
      if (isBookingNotFound(error)) {
        return null;
      }
      this.logger.error(
        `Confirmation result ${result.status} (attempt ${result.attempts}) for booking ${result.bookingId} was not recorded`,
      );
      throw error;
    });
  }
}
