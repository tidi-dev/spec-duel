import { CreateBookingDto } from '@roombook/contract';
import { createHash } from 'crypto';

export class BookingFingerprintUtil {
  static of(booking: CreateBookingDto): string {
    const fields = [booking.roomId, booking.title, booking.organizerEmail, booking.startsAt, booking.endsAt];
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  }
}
