import { Injectable } from '@nestjs/common';
import { CONFIRMATION_JOB_ATTEMPTS, ConfirmationStatusEnum } from '@roombook/contract';
import { BookingClient } from './booking.client';
import { SimulatedConfirmationSender } from './simulated-confirmation.sender';

@Injectable()
export class ConfirmationService {
  constructor(
    private readonly bookingClient: BookingClient,
    private readonly sender: SimulatedConfirmationSender,
  ) {}

  async confirm(bookingId: string, attempt: number): Promise<void> {
    const booking = await this.bookingClient.findBooking(bookingId);
    if (!booking || booking.confirmationStatus !== ConfirmationStatusEnum.PENDING) {
      return;
    }
    const delivered = this.sender.deliver(booking.organizerEmail, attempt);
    await this.bookingClient.reportOutcome({
      bookingId,
      status: this.statusOf(delivered, attempt),
      attempts: attempt,
    });
    if (!delivered) {
      throw new Error(`Confirmation for booking ${bookingId} was not delivered on attempt ${attempt}`);
    }
  }

  private statusOf(delivered: boolean, attempt: number): ConfirmationStatusEnum {
    if (delivered) {
      return ConfirmationStatusEnum.SENT;
    }
    return attempt >= CONFIRMATION_JOB_ATTEMPTS ? ConfirmationStatusEnum.FAILED : ConfirmationStatusEnum.PENDING;
  }
}
