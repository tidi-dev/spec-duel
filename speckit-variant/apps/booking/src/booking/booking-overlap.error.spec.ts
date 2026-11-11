import { RpcException } from '@nestjs/microservices';
import { ErrorCodeEnum } from '@roombook/contract';
import { raiseBookingOverlap } from './booking-overlap.error';

const errorOf = (raise: () => never): unknown => {
  try {
    return raise();
  } catch (error) {
    return error instanceof RpcException ? error.getError() : error;
  }
};

describe('raiseBookingOverlap', () => {
  it('throws the 409 overlap rejection with its message', () => {
    expect(errorOf(raiseBookingOverlap)).toEqual({
      statusCode: 409,
      errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
      message: 'The room is already booked for that time',
    });
  });
});
