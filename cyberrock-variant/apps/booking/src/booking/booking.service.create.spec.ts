import { RpcException } from '@nestjs/microservices';
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import {
  BookingDto,
  ConfirmationStatusEnum,
  CreateBookingDto,
  ErrorCodeEnum,
  RoomPatternEnum,
} from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking } from './booking-input';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ConfirmationProducer } from './confirmation.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

const R1 = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const K1 = '11111111-1111-4111-8111-111111111111';
const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';

const B1: CreateBookingDto = {
  roomId: R1,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const booking: BookingDto = {
  ...B1,
  id: ID,
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const errorOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const expectRpcError = (error: unknown, statusCode: number, errorCode: ErrorCodeEnum): void => {
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toEqual(expect.objectContaining({ statusCode, errorCode }));
};

describe('BookingService.createBooking', () => {
  let service: BookingService;
  const send = jest.fn();
  const enqueue = jest.fn();
  const create = jest.fn();

  const createB1 = (changes: Partial<CreateBookingDto> = {}): Promise<unknown> =>
    service.createBooking({ idempotencyKey: K1, booking: { ...B1, ...changes } });

  const expectNothingStored = (): void => {
    expect(create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    send.mockReturnValue(of({ id: R1, name: 'Atlas', capacity: 4 }));
    create.mockResolvedValue({ kind: 'created', booking });
    enqueue.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: BookingRepository, useValue: {} },
        { provide: IdempotentBookingRepository, useValue: { create } },
        { provide: ConfirmationProducer, useValue: { enqueue } },
        { provide: NATS_CLIENT, useValue: { send } },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('asks the room service, stores, then enqueues, and answers the new booking (BKG-001, BKG-005)', async () => {
    await expect(createB1()).resolves.toEqual({ booking, replayed: false });

    expect(send).toHaveBeenCalledWith(RoomPatternEnum.FIND_BY_ID, { id: R1 });
    expect(create).toHaveBeenCalledWith({
      key: K1,
      fingerprint: bookingFingerprint(normaliseCreateBooking(B1)),
      booking: normaliseCreateBooking(B1),
    });
    expect(enqueue).toHaveBeenCalledWith(ID);
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(enqueue.mock.invocationCallOrder[0]);
  });

  it('stores the offset form as its UTC instant with the fingerprint of the same request (BKG-001)', async () => {
    await createB1({ startsAt: '2030-01-07T16:00:00+07:00' });

    expect(create.mock.calls[0][0].booking.startsAt.toISOString()).toBe('2030-01-07T09:00:00.000Z');
    expect(create.mock.calls[0][0].fingerprint).toBe(bookingFingerprint(normaliseCreateBooking(B1)));
  });

  it.each([
    ['an end equal to the start', { endsAt: B1.startsAt }],
    ['an instant without an offset', { startsAt: '2030-01-07T09:00:00' }],
  ])('answers 400 for %s before asking the room service and stores nothing (IDM-007)', async (_case, changes) => {
    expectRpcError(await errorOf(createB1(changes)), 400, ErrorCodeEnum.VALIDATION);

    expect(send).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('answers 404 NOT_FOUND.ROOM for an unknown room and stores nothing (BKG-005, IDM-007)', async () => {
    const notFound = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: `Room ${R1} was not found` };
    send.mockReturnValue(throwError(() => notFound));

    const error = await errorOf(createB1());

    expectRpcError(error, 404, ErrorCodeEnum.ROOM_NOT_FOUND);
    expect((error as RpcException).getError()).toEqual(notFound);
    expectNothingStored();
  });

  it('answers 503 when the room service does not answer and stores nothing (BKG-005, IDM-007)', async () => {
    send.mockReturnValue(throwError(() => new EmptyResponseException(RoomPatternEnum.FIND_BY_ID)));

    expectRpcError(await errorOf(createB1()), 503, ErrorCodeEnum.SERVICE_UNAVAILABLE);
    expectNothingStored();
  });

  it('answers a replay with the stored body and enqueues the same booking id again (IDM-003, CNF-002)', async () => {
    create.mockResolvedValue({ kind: 'replayed', booking });

    await expect(createB1()).resolves.toEqual({ booking, replayed: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(ID);
  });

  it('answers 422 for a key reused with another body and enqueues nothing (IDM-005)', async () => {
    create.mockResolvedValue({ kind: 'reused' });

    expectRpcError(await errorOf(createB1()), 422, ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('answers 409 while the key is being processed and enqueues nothing (IDM-006)', async () => {
    create.mockResolvedValue({ kind: 'in-progress' });

    expectRpcError(await errorOf(createB1()), 409, ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('answers the 503 of a failed enqueue after the booking was stored (CNF-003)', async () => {
    const unavailable = new RpcException({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'x' });
    enqueue.mockRejectedValue(unavailable);

    await expect(createB1()).rejects.toBe(unavailable);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
