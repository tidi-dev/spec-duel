import { CreateBookingDto } from '@roombook/contract';
import { bookingFingerprint } from './booking-fingerprint.util';

describe('bookingFingerprint', () => {
  const booking: CreateBookingDto = {
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Weekly sync',
    organizerEmail: 'ada@example.com',
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T11:00:00.000Z',
  };

  it('returns 64 lower-case hex characters', () => {
    expect(bookingFingerprint(booking)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same value whatever the property order', () => {
    const reordered: CreateBookingDto = {
      endsAt: booking.endsAt,
      startsAt: booking.startsAt,
      organizerEmail: booking.organizerEmail,
      title: booking.title,
      roomId: booking.roomId,
    };

    expect(bookingFingerprint(reordered)).toBe(bookingFingerprint(booking));
  });

  it.each([
    ['roomId', '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'],
    ['title', 'Weekly sync!'],
    ['organizerEmail', 'grace@example.com'],
    ['startsAt', '2030-01-01T10:00:00Z'],
    ['endsAt', '2030-01-01T11:00:00Z'],
  ] as const)('returns a different value when %s differs', (field, value) => {
    expect(bookingFingerprint({ ...booking, [field]: value })).not.toBe(bookingFingerprint(booking));
  });
});
