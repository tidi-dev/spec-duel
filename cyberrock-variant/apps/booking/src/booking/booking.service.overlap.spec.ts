import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ExceptionHelper, NATS_CLIENT } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum } from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ConfirmationProducer } from './confirmation.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

const R1 = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const K1 = '11111111-1111-4111-8111-111111111111';
const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const OVERLAP = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked in that time span',
};

const overlapping: CreateBookingDto = {
  roomId: R1,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:30:00.000Z',
  endsAt: '2030-01-07T10:30:00.000Z',
};

const stored: BookingDto = {
  ...overlapping,
  id: ID,
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const rejectWithOverlap = async (): Promise<never> =>
  ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, OVERLAP.message);

const rpcErrorOf = async (work: Promise<unknown>): Promise<unknown> => {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RpcException);
  return (error as RpcException).getError();
};

describe('BookingService and the overlap rule', () => {
  let service: BookingService;
  const send = jest.fn();
  const enqueue = jest.fn();
  const create = jest.fn();
  const update = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    send.mockReturnValue(of({ id: R1, name: 'Atlas', capacity: 4 }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: BookingRepository, useValue: { update } },
        { provide: IdempotentBookingRepository, useValue: { create } },
        { provide: ConfirmationProducer, useValue: { enqueue } },
        { provide: NATS_CLIENT, useValue: { send } },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('BKG-013: answers 409 CONFLICT.BOOKING_OVERLAP for an overlapping create and enqueues no confirmation job', async () => {
    create.mockImplementation(rejectWithOverlap);

    await expect(rpcErrorOf(service.createBooking({ idempotencyKey: K1, booking: overlapping }))).resolves.toEqual(
      OVERLAP,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('BKG-013: answers 400 for an invalid span and 404 for an unknown room before any overlap check', async () => {
    create.mockImplementation(rejectWithOverlap);
    const notFound = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: `Room ${R1} was not found` };

    await expect(
      rpcErrorOf(
        service.createBooking({ idempotencyKey: K1, booking: { ...overlapping, endsAt: overlapping.startsAt } }),
      ),
    ).resolves.toMatchObject({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION });
    send.mockReturnValue(throwError(() => notFound));
    await expect(rpcErrorOf(service.createBooking({ idempotencyKey: K1, booking: overlapping }))).resolves.toEqual(
      notFound,
    );
    expect(create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('BKG-013: answers a replay of the creating request with its booking, not 409', async () => {
    create.mockResolvedValue({ kind: 'replayed', booking: stored });

    await expect(service.createBooking({ idempotencyKey: K1, booking: overlapping })).resolves.toEqual({
      booking: stored,
      replayed: true,
    });
  });

  it('BKG-014: answers 409 CONFLICT.BOOKING_OVERLAP for an update whose merged span overlaps another booking', async () => {
    update.mockImplementation(rejectWithOverlap);

    await expect(
      rpcErrorOf(service.updateBooking({ id: ID, changes: { startsAt: '2030-01-07T09:59:59.999Z' } })),
    ).resolves.toEqual(OVERLAP);
    expect(update).toHaveBeenCalledWith(ID, { startsAt: new Date('2030-01-07T09:59:59.999Z') });
  });

  it('BKG-014: a title-only update of a booking does not conflict with itself and answers the booking', async () => {
    const retitled = { ...stored, title: 'Retro' };
    update.mockResolvedValue(retitled);

    await expect(service.updateBooking({ id: ID, changes: { title: 'Retro' } })).resolves.toBe(retitled);
    expect(update).toHaveBeenCalledWith(ID, { title: 'Retro' });
  });
});
