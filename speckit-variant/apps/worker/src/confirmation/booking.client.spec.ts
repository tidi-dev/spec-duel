import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import {
  BookingDto,
  BookingPatternEnum,
  ConfirmationStatusEnum,
  ErrorCodeEnum,
  RecordConfirmationResultDto,
} from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { BookingClient } from './booking.client';

const booking: BookingDto = {
  id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T08:00:00.000Z',
  updatedAt: '2029-12-01T08:00:00.000Z',
};

describe('BookingClient', () => {
  let client: BookingClient;
  let send: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [BookingClient, { provide: NATS_CLIENT, useValue: { send } as unknown as ClientProxy }],
    }).compile();
    client = moduleRef.get(BookingClient);
  });

  it('asks the booking service for the booking by id', async () => {
    send.mockReturnValue(of(booking));

    await expect(client.findBooking(booking.id)).resolves.toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id: booking.id });
  });

  it('returns null when the booking service answers booking not found', async () => {
    send.mockReturnValue(
      throwError(() => ({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'Booking not found' })),
    );

    await expect(client.findBooking(booking.id)).resolves.toBeNull();
  });

  it.each([
    ['another domain error', { statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION, message: 'x' }],
    [
      'an unavailable booking service',
      new RpcException({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'x' }),
    ],
    ['an unknown error', new Error('boom')],
  ])('rethrows %s', async (_case, rejection) => {
    send.mockReturnValue(throwError(() => rejection));

    await expect(client.findBooking(booking.id)).rejects.toBe(rejection);
  });

  it('reports a confirmation result to the booking service', async () => {
    const report: RecordConfirmationResultDto = {
      bookingId: booking.id,
      status: ConfirmationStatusEnum.SENT,
      attempts: 1,
    };
    send.mockReturnValue(of(booking));

    await expect(client.recordResult(report)).resolves.toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.RECORD_CONFIRMATION, report);
  });
});
