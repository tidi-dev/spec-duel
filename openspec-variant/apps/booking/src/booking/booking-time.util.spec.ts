import { ErrorCodeEnum } from '@roombook/contract';
import { BookingTimeUtil } from './booking-time.util';
import { rpcErrorOf } from './testing/booking.fixture';

describe('BookingTimeUtil.toDate', () => {
  it.each([
    ['an offset', '2030-01-01T10:00:00+02:00', '2030-01-01T08:00:00.000Z'],
    ['a negative offset', '2030-01-01T10:00:00-05:00', '2030-01-01T15:00:00.000Z'],
    ['a UTC designator', '2030-01-01T10:00:00Z', '2030-01-01T10:00:00.000Z'],
    ['no zone designator', '2030-01-01T10:00:00', '2030-01-01T10:00:00.000Z'],
    ['no zone designator and fractions', '2030-01-01T10:00:00.250', '2030-01-01T10:00:00.250Z'],
    ['a date only', '2030-01-01', '2030-01-01T00:00:00.000Z'],
  ])('resolves a value with %s to its UTC instant', (_case, value, expected) => {
    expect(BookingTimeUtil.toDate(value).toISOString()).toBe(expected);
  });

  it.each([
    ['a week date', '2030-W01-1'],
    ['a week date with a time', '2030-W01-1T10:00:00'],
  ])('raises 400 BAD_REQUEST.VALIDATION for %s', async (_case, value) => {
    expect(await rpcErrorOf(() => BookingTimeUtil.toDate(value))).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
    );
  });
});
