import { formatUtcDateTime, inputValueToIsoUtc, isEndAfterStart, isoToInputValue } from './booking-time-format';

describe('booking-time-format', () => {
  it('renders an ISO time as YYYY-MM-DD HH:mm in UTC', () => {
    expect(formatUtcDateTime('2030-01-01T09:30:00.000Z')).toBe('2030-01-01 09:30');
  });

  it('renders an ISO time with an offset in UTC', () => {
    expect(formatUtcDateTime('2030-01-01T01:30:00+02:00')).toBe('2029-12-31 23:30');
  });

  it('turns an ISO time into a datetime-local input value in UTC', () => {
    expect(isoToInputValue('2030-01-01T09:30:00.000Z')).toBe('2030-01-01T09:30');
  });

  it('turns a datetime-local input value into an ISO UTC time', () => {
    expect(inputValueToIsoUtc('2030-01-01T09:30')).toBe('2030-01-01T09:30:00.000Z');
  });

  it.each([
    ['2030-01-01T10:30', '2030-01-01T09:30', true],
    ['2030-01-01T09:30', '2030-01-01T09:30', false],
    ['2030-01-01T09:00', '2030-01-01T09:30', false],
  ])('tells whether end %s is later than start %s', (endsAt, startsAt, expected) => {
    expect(isEndAfterStart(endsAt, startsAt)).toBe(expected);
  });
});
