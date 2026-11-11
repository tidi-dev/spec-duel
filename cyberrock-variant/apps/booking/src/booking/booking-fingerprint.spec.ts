import { CreateBookingDto } from '@roombook/contract';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking } from './booking-input';

const B1: CreateBookingDto = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const fingerprintOf = (body: CreateBookingDto): string => bookingFingerprint(normaliseCreateBooking(body));

describe('bookingFingerprint (IDM-004, R-06)', () => {
  it('is a SHA-256 hex digest', () => {
    expect(fingerprintOf(B1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is equal for two spellings of the same request', () => {
    const otherSpelling: CreateBookingDto = {
      endsAt: '2030-01-07T10:00:00Z',
      startsAt: '2030-01-07T16:00:00+07:00',
      organizerEmail: 'ann@example.com',
      title: 'Sprint planning',
      roomId: '3F0C1A52-8F0B-4C59-9A6E-1D2B7C9E4A10',
    };

    expect(fingerprintOf(otherSpelling)).toBe(fingerprintOf(B1));
  });

  it.each([
    ['title in another case', { title: 'sprint planning' }],
    ['title', { title: 'Retro' }],
    ['organizer', { organizerEmail: 'bob@example.com' }],
    ['room', { roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a11' }],
    ['start', { startsAt: '2030-01-07T09:00:00.001Z' }],
    ['end', { endsAt: '2030-01-07T10:00:00.001Z' }],
  ] as Array<[string, Partial<CreateBookingDto>]>)('differs for another %s', (_case, change) => {
    expect(fingerprintOf({ ...B1, ...change })).not.toBe(fingerprintOf(B1));
  });

  it('does not confuse a value that moved to the neighbouring field', () => {
    const first = fingerprintOf({ ...B1, title: 'a","b', organizerEmail: 'c@example.com' });
    const second = fingerprintOf({ ...B1, title: 'a', organizerEmail: 'b","c@example.com' });

    expect(first).not.toBe(second);
  });
});
