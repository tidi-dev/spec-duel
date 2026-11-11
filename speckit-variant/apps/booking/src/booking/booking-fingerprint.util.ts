import { CreateBookingDto } from '@roombook/contract';
import { createHash } from 'node:crypto';

export const bookingFingerprint = (booking: CreateBookingDto): string =>
  createHash('sha256')
    .update(
      JSON.stringify([booking.roomId, booking.title, booking.organizerEmail, booking.startsAt, booking.endsAt]),
    )
    .digest('hex');
