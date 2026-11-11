import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { BookingDto, ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum } from '@roombook/contract';
import { ClaimBookingOutcomeEnum } from './claim-booking-result.dto';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { CreateBookingService } from './create-booking.service';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomClient } from './room.client';

const KEY = '5d3c8a44-2f0e-4b7a-9c1d-6e8f0a1b2c3d';

const request: CreateBookingDto = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const created: BookingDto = {
  ...request,
  id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T08:00:00.000Z',
  updatedAt: '2029-12-01T08:00:00.000Z',
};

const overlapClaim = { outcome: ClaimBookingOutcomeEnum.OVERLAP, booking: null };

const overlapError = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked for that time',
};

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof RpcException ? error.getError() : error),
  );

describe('CreateBookingService overlap rejection', () => {
  let service: CreateBookingService;
  let claim: jest.Mock;
  let enqueue: jest.Mock;

  const create = (): Promise<unknown> => service.createBooking({ idempotencyKey: KEY, booking: request });

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    claim = jest.fn().mockResolvedValue(overlapClaim);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateBookingService,
        { provide: RoomClient, useValue: { findRoomById: jest.fn().mockResolvedValue({ id: request.roomId }) } },
        {
          provide: IdempotentBookingRepository,
          useValue: { claim, findByKey: jest.fn().mockResolvedValue(null) },
        },
        { provide: ConfirmationQueueProducer, useValue: { enqueue } },
      ],
    }).compile();
    service = moduleRef.get(CreateBookingService);
  });

  it('raises 409 for an OVERLAP claim and enqueues nothing', async () => {
    await expect(errorOf(create())).resolves.toEqual(overlapError);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('raises the same 409 again for the same key and body while the span is still taken', async () => {
    await expect(errorOf(create())).resolves.toEqual(overlapError);

    await expect(errorOf(create())).resolves.toEqual(overlapError);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('creates and enqueues one job when the same key is claimed after the rejection', async () => {
    await expect(errorOf(create())).resolves.toEqual(overlapError);
    claim.mockResolvedValue({ outcome: ClaimBookingOutcomeEnum.CREATED, booking: created });

    await expect(create()).resolves.toEqual({ booking: created, replayed: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(created.id);
  });
});
