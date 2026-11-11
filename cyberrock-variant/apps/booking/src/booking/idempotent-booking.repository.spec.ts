import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { DataSource, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import { NormalisedBookingDto } from './booking-input';
import { IdempotentBookingRepository, IdempotentCreateDto } from './idempotent-booking.repository';

const KEY = '11111111-1111-4111-8111-11111111abcd';
const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const FINGERPRINT = 'f'.repeat(64);
const OVERLAP = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked in that time span',
};

const booking: NormalisedBookingDto = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: new Date('2030-01-07T09:00:00.000Z'),
  endsAt: new Date('2030-01-07T10:00:00.000Z'),
};

const createdDto: BookingDto = {
  id: ID,
  roomId: booking.roomId,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const command = (overrides: Partial<IdempotentCreateDto> = {}): IdempotentCreateDto => ({
  key: KEY,
  fingerprint: FINGERPRINT,
  booking,
  ...overrides,
});

const constraintError = (constraint: string): QueryFailedError =>
  new QueryFailedError('INSERT', [], Object.assign(new Error('violation'), { constraint }));

describe('IdempotentBookingRepository', () => {
  let repository: IdempotentBookingRepository;
  const manager = { query: jest.fn(), findOneBy: jest.fn(), existsBy: jest.fn(), save: jest.fn(), insert: jest.fn() };
  const transaction = jest.fn();

  const overlapOf = async (): Promise<unknown> => {
    const error = await repository.create(command()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RpcException);
    return (error as RpcException).getError();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((work: (transactionManager: typeof manager) => unknown) => work(manager));
    manager.query.mockResolvedValue([{ obtained: true }]);
    manager.findOneBy.mockResolvedValue(null);
    manager.existsBy.mockResolvedValue(false);
    manager.save.mockImplementation((_target: unknown, values: object) =>
      Promise.resolve({
        ...values,
        id: ID,
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
        updatedAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [IdempotentBookingRepository, { provide: DataSource, useValue: { transaction } }],
    }).compile();
    repository = moduleRef.get(IdempotentBookingRepository);
  });

  it('stores the booking and the key with the response body in one transaction (IDM-002)', async () => {
    const outcome = await repository.create(command());

    expect(outcome).toEqual({ kind: 'created', booking: createdDto });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(BookingEntity, {
      ...booking,
      confirmationStatus: ConfirmationStatusEnum.PENDING,
      confirmationAttempts: 0,
    });
    expect(manager.insert).toHaveBeenCalledWith(IdempotencyKeyEntity, {
      key: KEY,
      fingerprint: FINGERPRINT,
      responseBody: createdDto,
    });
  });

  it('claims and looks the key up in lower case (IDM-004)', async () => {
    await repository.create(command({ key: KEY.toUpperCase() }));

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [KEY]);
    expect(manager.findOneBy).toHaveBeenCalledWith(IdempotencyKeyEntity, { key: KEY });
    expect(manager.insert).toHaveBeenCalledWith(IdempotencyKeyEntity, expect.objectContaining({ key: KEY }));
  });

  it('replays the stored body unchanged and creates nothing (IDM-003)', async () => {
    manager.findOneBy.mockResolvedValue({ key: KEY, fingerprint: FINGERPRINT, responseBody: createdDto });

    const outcome = await repository.create(command());

    expect(outcome).toEqual({ kind: 'replayed', booking: createdDto });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('reports a stored key that arrives with another fingerprint (IDM-005)', async () => {
    manager.findOneBy.mockResolvedValue({ key: KEY, fingerprint: 'e'.repeat(64), responseBody: createdDto });

    await expect(repository.create(command())).resolves.toEqual({ kind: 'reused' });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('reads the key, then locks the room and checks the span, then stores (BKG-013, BKG-015)', async () => {
    await repository.create(command());

    expect(manager.query).toHaveBeenNthCalledWith(2, expect.stringContaining('pg_advisory_xact_lock'), [
      booking.roomId,
    ]);
    expect(manager.existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: booking.roomId,
      startsAt: LessThan(booking.endsAt),
      endsAt: MoreThan(booking.startsAt),
    });
    const order = [manager.findOneBy, manager.existsBy, manager.save].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((first, second) => first - second));
    expect(manager.query.mock.invocationCallOrder[1]).toBeGreaterThan(order[0]);
    expect(manager.query.mock.invocationCallOrder[1]).toBeLessThan(order[1]);
  });

  it('fails the transaction with 409 CONFLICT.BOOKING_OVERLAP and writes no booking and no key (BKG-013, IDM-007)', async () => {
    manager.existsBy.mockResolvedValue(true);

    await expect(overlapOf()).resolves.toEqual(OVERLAP);
    await expect(transaction.mock.results[0].value).rejects.toBeInstanceOf(RpcException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['a replay', FINGERPRINT],
    ['a reused key', 'e'.repeat(64)],
  ])('never locks the room or checks the span for %s (BKG-013)', async (_case, fingerprint) => {
    manager.findOneBy.mockResolvedValue({ key: KEY, fingerprint, responseBody: createdDto });
    manager.existsBy.mockResolvedValue(true);

    await expect(repository.create(command())).resolves.toBeDefined();
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.existsBy).not.toHaveBeenCalled();
  });

  it('maps an EXCL_bookings_room_span violation to the same 409 (BKG-016)', async () => {
    manager.save.mockRejectedValue(constraintError('EXCL_bookings_room_span'));

    await expect(overlapOf()).resolves.toEqual(OVERLAP);
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('answers in-progress without reading or writing when the lock is taken (IDM-006)', async () => {
    manager.query.mockResolvedValue([{ obtained: false }]);

    await expect(repository.create(command())).resolves.toEqual({ kind: 'in-progress' });
    expect(manager.findOneBy).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('answers in-progress when the primary key refuses a second row for the key (R-08)', async () => {
    manager.insert.mockRejectedValue(constraintError('PK_idempotency_keys_key'));

    await expect(repository.create(command())).resolves.toEqual({ kind: 'in-progress' });
  });

  it('maps a CHK_bookings_span violation to 400 (BKG-011)', async () => {
    manager.save.mockRejectedValue(constraintError('CHK_bookings_span'));

    const error = await repository.create(command()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
    );
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('passes any other database error through', async () => {
    const failure = new Error('connection lost');
    manager.save.mockRejectedValue(failure);

    await expect(repository.create(command())).rejects.toBe(failure);
  });
});
