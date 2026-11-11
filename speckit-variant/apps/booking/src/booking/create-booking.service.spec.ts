import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { BookingDto, ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum } from '@roombook/contract';
import { bookingFingerprint } from './booking-fingerprint.util';
import { ClaimBookingOutcomeEnum } from './claim-booking-result.dto';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { CreateBookingService } from './create-booking.service';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomClient } from './room.client';

const KEY = '5D3C8A44-2F0E-4B7A-9C1D-6E8F0A1B2C3D';

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

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof RpcException ? error.getError() : error),
  );

describe('CreateBookingService', () => {
  let service: CreateBookingService;
  let findRoomById: jest.Mock;
  let claim: jest.Mock;
  let findByKey: jest.Mock;
  let enqueue: jest.Mock;

  const create = (booking: CreateBookingDto = request): Promise<unknown> =>
    service.createBooking({ idempotencyKey: KEY, booking });

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    findByKey = jest.fn().mockResolvedValue(null);
    findRoomById = jest.fn().mockResolvedValue({ id: request.roomId, name: 'Room 01', capacity: 2 });
    claim = jest.fn().mockResolvedValue({ outcome: ClaimBookingOutcomeEnum.CREATED, booking: created });
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateBookingService,
        { provide: RoomClient, useValue: { findRoomById } },
        { provide: IdempotentBookingRepository, useValue: { claim, findByKey } },
        { provide: ConfirmationQueueProducer, useValue: { enqueue } },
      ],
    }).compile();
    service = moduleRef.get(CreateBookingService);
  });

  it.each([
    ['startsAt does not parse', { startsAt: '2030-W02-1' }, 'startsAt and endsAt must be valid date-times'],
    ['endsAt does not parse', { endsAt: '2030-W02-1' }, 'startsAt and endsAt must be valid date-times'],
    ['endsAt equals startsAt', { endsAt: request.startsAt }, 'endsAt must be later than startsAt'],
    ['endsAt is earlier than startsAt', { endsAt: '2030-01-07T08:00:00.000Z' }, 'endsAt must be later than startsAt'],
  ])('raises 400 without a room check or a claim when %s', async (_case, override, message) => {
    const error = await errorOf(create({ ...request, ...override }));

    expect(error).toEqual({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION, message });
    expect(findRoomById).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    [404, ErrorCodeEnum.ROOM_NOT_FOUND],
    [503, ErrorCodeEnum.SERVICE_UNAVAILABLE],
  ])('propagates a %i room error and claims nothing', async (statusCode, errorCode) => {
    const roomError = new RpcException({ statusCode, errorCode, message: 'x' });
    findRoomById.mockRejectedValue(roomError);

    await expect(create()).rejects.toBe(roomError);
    expect(findRoomById).toHaveBeenCalledWith(request.roomId);
    expect(claim).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('claims with the lower-cased key and the fingerprint and answers the created booking', async () => {
    await expect(create()).resolves.toEqual({ booking: created, replayed: false });

    expect(claim).toHaveBeenCalledWith(KEY.toLowerCase(), bookingFingerprint(request), request);
  });

  it('enqueues one confirmation job with the booking id after a CREATED claim', async () => {
    await create();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(created.id);
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(enqueue.mock.invocationCallOrder[0]);
  });

  describe('with a stored idempotency row', () => {
    it('replays the stored body for the same fingerprint without a room check or a claim', async () => {
      findByKey.mockResolvedValue({ requestFingerprint: bookingFingerprint(request), responseBody: created });

      await expect(create()).resolves.toEqual({ booking: created, replayed: true });
      expect(findByKey).toHaveBeenCalledWith(KEY.toLowerCase());
      expect(findRoomById).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('raises 422 for another fingerprint', async () => {
      findByKey.mockResolvedValue({ requestFingerprint: 'b'.repeat(64), responseBody: created });

      await expect(errorOf(create())).resolves.toEqual({
        statusCode: 422,
        errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key was already used with a different request body',
      });
      expect(claim).not.toHaveBeenCalled();
    });
  });

  describe('claim outcomes', () => {
    afterEach(() => expect(enqueue).not.toHaveBeenCalled());

    it('answers a REPLAYED claim with the stored booking', async () => {
      claim.mockResolvedValue({ outcome: ClaimBookingOutcomeEnum.REPLAYED, booking: created });

      await expect(create()).resolves.toEqual({ booking: created, replayed: true });
    });

    it('raises 422 for a KEY_REUSED claim', async () => {
      claim.mockResolvedValue({ outcome: ClaimBookingOutcomeEnum.KEY_REUSED, booking: null });

      await expect(errorOf(create())).resolves.toEqual({
        statusCode: 422,
        errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key was already used with a different request body',
      });
    });

    it('raises 409 for an IN_PROGRESS claim', async () => {
      claim.mockResolvedValue({ outcome: ClaimBookingOutcomeEnum.IN_PROGRESS, booking: null });

      await expect(errorOf(create())).resolves.toEqual({
        statusCode: 409,
        errorCode: ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS,
        message: 'A request with this Idempotency-Key is still being processed',
      });
    });
  });

  describe('the same key after a rejected request', () => {
    it('creates the corrected body after a failed time check', async () => {
      await expect(errorOf(create({ ...request, endsAt: request.startsAt }))).resolves.toEqual(
        expect.objectContaining({ statusCode: 400 }),
      );
      expect(claim).not.toHaveBeenCalled();

      await expect(create()).resolves.toEqual({ booking: created, replayed: false });
    });

    it('creates the corrected body after a failed room check', async () => {
      const roomError = new RpcException({ statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'x' });
      findRoomById.mockRejectedValueOnce(roomError);
      await expect(create({ ...request, roomId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' })).rejects.toBe(roomError);
      expect(claim).not.toHaveBeenCalled();

      await expect(create()).resolves.toEqual({ booking: created, replayed: false });
      expect(claim).toHaveBeenCalledTimes(1);
    });
  });
});
