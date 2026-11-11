import { Injectable } from '@nestjs/common';
import { CONFIRMATION_JOB_ATTEMPTS, ConfirmationStatusEnum } from '@roombook/contract';
import { BookingClient } from './booking.client';
import { SimulatedConfirmationSender } from './simulated-confirmation-sender';

const statusAfterFailure = (attempt: number): ConfirmationStatusEnum =>
  attempt >= CONFIRMATION_JOB_ATTEMPTS ? ConfirmationStatusEnum.FAILED : ConfirmationStatusEnum.PENDING;

@Injectable()
export class ConfirmationService {
  constructor(
    private readonly bookingClient: BookingClient,
    private readonly sender: SimulatedConfirmationSender,
  ) {}

  async processAttempt(bookingId: string, attempt: number): Promise<void> {
    const booking = await this.bookingClient.findBooking(bookingId);
    if (!booking || booking.confirmationStatus !== ConfirmationStatusEnum.PENDING) {
      return;
    }
    const sent = this.sender.send(booking.organizerEmail, attempt);
    const status = sent ? ConfirmationStatusEnum.SENT : statusAfterFailure(attempt);
    await this.bookingClient.recordResult({ bookingId, status, attempts: attempt });
    if (!sent) {
      throw new Error(`Confirmation attempt ${attempt} for booking ${bookingId} failed`);
    }
  }
}
