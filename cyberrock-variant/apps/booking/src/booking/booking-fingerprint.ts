import { createHash } from 'crypto';
import { NormalisedBookingDto } from './booking-input';

export const bookingFingerprint = (booking: NormalisedBookingDto): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        booking.roomId,
        booking.title,
        booking.organizerEmail,
        booking.startsAt.getTime(),
        booking.endsAt.getTime(),
      ]),
    )
    .digest('hex');
