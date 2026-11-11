import { Test } from '@nestjs/testing';
import { IdempotencyKeyEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, CreateBookingMessageDto, ErrorCodeEnum } from '@roombook/contract';
import { BookingFingerprintUtil } from './booking-fingerprint.util';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { IdempotentCreateOutcomeKindEnum } from './dto/idempotent-create-outcome';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomLookupClient } from './room-lookup.client';
import { BOOKING_ID, bookingDto, ROOM_ID, rpcErrorOf } from './testing/booking.fixture';

describe('BookingService.createBooking', () => {
  const idempotencyKey = '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d';
  const message: CreateBookingMessageDto = {
    idempotencyKey,
    booking: {
      roomId: ROOM_ID,
      title: 'Planning',
      organizerEmail: 'ana@example.com',
      startsAt: '2030-01-01T12:00:00+02:00',
      endsAt: '2030-01-01T11:00:00',
    },
  };
  const requestFingerprint = BookingFingerprintUtil.of(message.booking);
  const storedKey = (fingerprint: string): IdempotencyKeyEntity =>
    Object.assign(new IdempotencyKeyEntity(), {
      key: idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody: bookingDto(),
    });
  let service: BookingService;
  let findByKey: jest.Mock;
  let create: jest.Mock;
  let assertRoomExists: jest.Mock;
  let enqueue: jest.Mock;

  beforeEach(async () => {
    findByKey = jest.fn().mockResolvedValue(null);
    create = jest.fn().mockResolvedValue({ kind: IdempotentCreateOutcomeKindEnum.CREATED, booking: bookingDto() });
    assertRoomExists = jest.fn().mockResolvedValue(undefined);
    enqueue = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        BookingValidator,
        { provide: BookingRepository, useValue: {} },
        { provide: IdempotentBookingRepository, useValue: { findByKey, create } },
        { provide: RoomLookupClient, useValue: { assertRoomExists } },
        { provide: ConfirmationQueueProducer, useValue: { enqueue } },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('creates the booking, enqueues one confirmation and answers replayed false', async () => {
    await expect(service.createBooking(message)).resolves.toEqual({ booking: bookingDto(), replayed: false });

    expect(findByKey).toHaveBeenCalledWith(idempotencyKey);
    expect(assertRoomExists).toHaveBeenCalledWith(ROOM_ID);
    expect(create).toHaveBeenCalledWith({
      idempotencyKey,
      requestFingerprint,
      roomId: ROOM_ID,
      title: 'Planning',
      organizerEmail: 'ana@example.com',
      startsAt: new Date('2030-01-01T10:00:00.000Z'),
      endsAt: new Date('2030-01-01T11:00:00.000Z'),
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('reads the key, then asks for the room, then stores, then enqueues', async () => {
    await service.createBooking(message);

    const order = [findByKey, assertRoomExists, create, enqueue].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('replays the stored body from the fast path without asking for the room', async () => {
    findByKey.mockResolvedValue(storedKey(requestFingerprint));

    await expect(service.createBooking(message)).resolves.toEqual({ booking: bookingDto(), replayed: true });
    expect(assertRoomExists).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('replays the body first answered, not the current state of the booking', async () => {
    findByKey.mockResolvedValue(storedKey(requestFingerprint));

    const result = await service.createBooking(message);

    expect(result.booking.confirmationStatus).toBe(ConfirmationStatusEnum.PENDING);
    expect(result.booking.confirmationAttempts).toBe(0);
  });

  it('replays the stored body when the repository finds the key, without enqueueing', async () => {
    create.mockResolvedValue({
      kind: IdempotentCreateOutcomeKindEnum.EXISTING,
      storedKey: storedKey(requestFingerprint),
    });

    await expect(service.createBooking(message)).resolves.toEqual({ booking: bookingDto(), replayed: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['the fast path', (): unknown => findByKey.mockResolvedValue(storedKey('0'.repeat(64)))],
    [
      'the repository',
      (): unknown =>
        create.mockResolvedValue({
          kind: IdempotentCreateOutcomeKindEnum.EXISTING,
          storedKey: storedKey('0'.repeat(64)),
        }),
    ],
  ])('raises 422 UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED for a different fingerprint from %s', async (_case, arrange) => {
    arrange();

    expect(await rpcErrorOf(() => service.createBooking(message))).toEqual(
      expect.objectContaining({ statusCode: 422, errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED }),
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('raises 409 CONFLICT.IDEMPOTENCY_IN_PROGRESS while the key is being stored', async () => {
    create.mockResolvedValue({ kind: IdempotentCreateOutcomeKindEnum.IN_PROGRESS });

    expect(await rpcErrorOf(() => service.createBooking(message))).toEqual(
      expect.objectContaining({ statusCode: 409, errorCode: ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS }),
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('raises 409 CONFLICT.BOOKING_OVERLAP with a message and enqueues nothing when the span is taken', async () => {
    create.mockResolvedValue({ kind: IdempotentCreateOutcomeKindEnum.OVERLAP });

    expect(await rpcErrorOf(() => service.createBooking(message))).toEqual({
      statusCode: 409,
      errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
      message: expect.stringMatching(/.+/),
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['endsAt equal to startsAt', { endsAt: '2030-01-01T10:00:00Z' }],
    ['endsAt earlier than startsAt', { endsAt: '2030-01-01T09:00:00Z' }],
    ['a time that is not an instant', { startsAt: '2030-W01-1' }],
  ])('raises 400 BAD_REQUEST.VALIDATION for %s before any key read', async (_case, change) => {
    const invalid = { idempotencyKey, booking: { ...message.booking, ...change } };

    expect(await rpcErrorOf(() => service.createBooking(invalid))).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
    );
    expect(findByKey).not.toHaveBeenCalled();
    expect(assertRoomExists).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('lets 404 NOT_FOUND.ROOM pass with nothing stored and nothing enqueued', async () => {
    const roomNotFound = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'x' };
    assertRoomExists.mockRejectedValue(roomNotFound);

    await expect(service.createBooking(message)).rejects.toBe(roomNotFound);
    expect(create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
