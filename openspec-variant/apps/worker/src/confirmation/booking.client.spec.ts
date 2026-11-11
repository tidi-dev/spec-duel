import { RpcException } from '@nestjs/microservices';
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { BookingPatternEnum, ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { BookingClient } from './booking.client';

describe('BookingClient', () => {
  const bookingId = '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f';
  let client: BookingClient;
  let send: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [BookingClient, { provide: NATS_CLIENT, useValue: { send } }],
    }).compile();
    client = moduleRef.get(BookingClient);
  });

  it('finds the booking through the booking service', async () => {
    const booking = { id: bookingId, organizerEmail: 'ana@example.com' };
    send.mockReturnValue(of(booking));

    await expect(client.findBooking(bookingId)).resolves.toBe(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id: bookingId });
  });

  it('returns null when the booking service answers NOT_FOUND.BOOKING', async () => {
    send.mockReturnValue(
      throwError(() => ({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'gone' })),
    );

    await expect(client.findBooking(bookingId)).resolves.toBeNull();
  });

  it('rethrows another error answered by the booking service', async () => {
    const relayed = { status: 'error', message: 'Internal server error' };
    send.mockReturnValue(throwError(() => relayed));

    await expect(client.findBooking(bookingId)).rejects.toBe(relayed);
  });

  it('rethrows 503 UNAVAILABLE.SERVICE when the booking service does not answer', async () => {
    send.mockReturnValue(throwError(() => new EmptyResponseException(BookingPatternEnum.FIND_BY_ID)));

    const error = await client.findBooking(bookingId).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
    );
  });

  it('reports an outcome to the record confirmation pattern', async () => {
    const outcome = { bookingId, status: ConfirmationStatusEnum.SENT, attempts: 3 };
    send.mockReturnValue(of(true));

    await expect(client.reportOutcome(outcome)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.RECORD_CONFIRMATION, outcome);
  });

  it('rejects when the outcome cannot be reported', async () => {
    send.mockReturnValue(throwError(() => new EmptyResponseException(BookingPatternEnum.RECORD_CONFIRMATION)));

    await expect(
      client.reportOutcome({ bookingId, status: ConfirmationStatusEnum.SENT, attempts: 1 }),
    ).rejects.toBeInstanceOf(RpcException);
  });
});
