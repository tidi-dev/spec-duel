import { ErrorCodeEnum } from '@roombook/contract';
import { BookingValidator } from './booking.validator';
import { rpcErrorOf } from './testing/booking.fixture';

describe('BookingValidator.assertTimeOrder', () => {
  const validator = new BookingValidator();
  const startsAt = new Date('2030-01-01T10:00:00.000Z');

  it('accepts an end later than the start', () => {
    expect(() => validator.assertTimeOrder(startsAt, new Date('2030-01-01T10:00:00.001Z'))).not.toThrow();
  });

  it.each([
    ['equal to', '2030-01-01T10:00:00.000Z'],
    ['earlier than', '2030-01-01T09:59:59.999Z'],
  ])('raises 400 BAD_REQUEST.VALIDATION for an end %s the start', async (_case, endsAt) => {
    expect(await rpcErrorOf(() => validator.assertTimeOrder(startsAt, new Date(endsAt)))).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
    );
  });
});
