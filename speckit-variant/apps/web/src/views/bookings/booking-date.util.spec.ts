import { formatDateTime, toLocalInputValue, toUtcIso } from './booking-date.util';

describe('booking-date.util', () => {
  it('toUtcIso turns a datetime-local value into the UTC ISO string of the same local instant', () => {
    expect(toUtcIso('2030-01-07T09:05')).toBe(new Date(2030, 0, 7, 9, 5).toISOString());
  });

  it('toLocalInputValue turns an ISO string into YYYY-MM-DDTHH:mm local time', () => {
    const iso = new Date(2030, 10, 3, 4, 5).toISOString();

    expect(toLocalInputValue(iso)).toBe('2030-11-03T04:05');
  });

  it('toLocalInputValue round-trips with toUtcIso', () => {
    expect(toLocalInputValue(toUtcIso('2030-12-31T23:59'))).toBe('2030-12-31T23:59');
    expect(toUtcIso(toLocalInputValue('2030-06-15T12:30:00.000Z'))).toBe('2030-06-15T12:30:00.000Z');
  });

  it('formatDateTime returns the locale string of the instant', () => {
    const iso = '2030-01-07T09:00:00.000Z';

    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString());
  });
});
