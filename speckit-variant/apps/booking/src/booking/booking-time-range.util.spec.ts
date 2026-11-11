import { isEndAfterStart, parseBookingInstant } from './booking-time-range.util';

describe('parseBookingInstant', () => {
  it('returns the instant of an ISO date-time', () => {
    expect(parseBookingInstant('2030-01-07T09:00:00.000Z')).toEqual(new Date('2030-01-07T09:00:00.000Z'));
  });

  it('returns null for a value that does not parse to an instant', () => {
    expect(parseBookingInstant('2030-W02-1')).toBeNull();
  });
});

describe('isEndAfterStart', () => {
  const start = new Date('2030-01-07T09:00:00.000Z');

  it('is true when the end is strictly later', () => {
    expect(isEndAfterStart(start, new Date('2030-01-07T09:00:00.001Z'))).toBe(true);
  });

  it('is false when the end equals the start', () => {
    expect(isEndAfterStart(start, new Date('2030-01-07T09:00:00.000Z'))).toBe(false);
  });

  it('is false when the end is earlier', () => {
    expect(isEndAfterStart(start, new Date('2030-01-07T08:59:59.999Z'))).toBe(false);
  });
});
