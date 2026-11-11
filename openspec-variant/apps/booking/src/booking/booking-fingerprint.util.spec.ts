import { CreateBookingDto } from '@roombook/contract';
import { BookingFingerprintUtil } from './booking-fingerprint.util';
import { ROOM_ID } from './testing/booking.fixture';

describe('BookingFingerprintUtil.of', () => {
  const body: CreateBookingDto = {
    roomId: ROOM_ID,
    title: 'Planning',
    organizerEmail: 'ana@example.com',
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T11:00:00.000Z',
  };

  it('is a SHA-256 hex digest', () => {
    expect(BookingFingerprintUtil.of(body)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is equal for equal bodies, whatever the order of their fields', () => {
    const reordered: CreateBookingDto = {
      endsAt: body.endsAt,
      startsAt: body.startsAt,
      organizerEmail: body.organizerEmail,
      title: body.title,
      roomId: body.roomId,
    };

    expect(BookingFingerprintUtil.of(reordered)).toBe(BookingFingerprintUtil.of({ ...body }));
  });

  it.each([
    ['a changed title', { title: 'Planning ' }],
    ['a changed room', { roomId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' }],
    ['a changed organizer', { organizerEmail: 'Ana@example.com' }],
    ['the same start instant written differently', { startsAt: '2030-01-01T10:00:00Z' }],
    ['the same end instant written differently', { endsAt: '2030-01-01T12:00:00.000+01:00' }],
  ])('differs for %s', (_case, change) => {
    expect(BookingFingerprintUtil.of({ ...body, ...change })).not.toBe(BookingFingerprintUtil.of(body));
  });

  it('does not confuse a value moved between two fields', () => {
    const swapped = { ...body, startsAt: body.endsAt, endsAt: body.startsAt };

    expect(BookingFingerprintUtil.of(swapped)).not.toBe(BookingFingerprintUtil.of(body));
  });
});
