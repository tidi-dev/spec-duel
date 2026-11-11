import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource, LessThan, MoreThan } from 'typeorm';
import { CreateBookingCommand } from './dto/create-booking.command';
import { IdempotentCreateOutcomeKindEnum } from './dto/idempotent-create-outcome';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { bookingDto, bookingEntity, ROOM_ID } from './testing/booking.fixture';

describe('IdempotentBookingRepository', () => {
  const key = '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d';
  const command: CreateBookingCommand = {
    idempotencyKey: key,
    requestFingerprint: 'f'.repeat(64),
    roomId: ROOM_ID,
    title: 'Planning',
    organizerEmail: 'ana@example.com',
    startsAt: new Date('2030-01-01T10:00:00.000Z'),
    endsAt: new Date('2030-01-01T11:00:00.000Z'),
  };
  const storedKey = Object.assign(new IdempotencyKeyEntity(), {
    key,
    requestFingerprint: 'f'.repeat(64),
    responseStatus: 201,
    responseBody: bookingDto(),
  });
  let repository: IdempotentBookingRepository;
  let findKey: jest.Mock;
  let transaction: jest.Mock;
  let manager: Record<'query' | 'findOneBy' | 'existsBy' | 'create' | 'save' | 'insert', jest.Mock>;
  let keyLocked: boolean;

  beforeEach(async () => {
    keyLocked = true;
    manager = {
      query: jest.fn(async (sql: string) => (sql.includes('pg_try_advisory_xact_lock') ? [{ locked: keyLocked }] : [])),
      findOneBy: jest.fn().mockResolvedValue(null),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, values: Partial<BookingEntity>) => values),
      save: jest.fn().mockResolvedValue(bookingEntity()),
      insert: jest.fn().mockResolvedValue({}),
    };
    transaction = jest.fn((work: (entityManager: typeof manager) => unknown) => work(manager));
    findKey = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotentBookingRepository,
        { provide: DataSource, useValue: { transaction } },
        { provide: getRepositoryToken(IdempotencyKeyEntity), useValue: { findOneBy: findKey } },
      ],
    }).compile();
    repository = moduleRef.get(IdempotentBookingRepository);
  });

  it('finds a stored key', async () => {
    findKey.mockResolvedValue(storedKey);

    await expect(repository.findByKey(key)).resolves.toBe(storedKey);
    expect(findKey).toHaveBeenCalledWith({ key });
  });

  it('returns null for a key that was never stored', async () => {
    findKey.mockResolvedValue(null);

    await expect(repository.findByKey(key)).resolves.toBeNull();
  });

  it('stores the booking and its key in one transaction and answers created', async () => {
    const outcome = await repository.create(command);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [key]);
    expect(manager.findOneBy).toHaveBeenCalledWith(IdempotencyKeyEntity, { key });
    expect(manager.save).toHaveBeenCalledWith(BookingEntity, {
      roomId: ROOM_ID,
      title: 'Planning',
      organizerEmail: 'ana@example.com',
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      confirmationStatus: ConfirmationStatusEnum.PENDING,
      confirmationAttempts: 0,
    });
    expect(manager.insert).toHaveBeenCalledWith(IdempotencyKeyEntity, {
      key,
      requestFingerprint: command.requestFingerprint,
      responseStatus: 201,
      responseBody: bookingDto(),
    });
    expect(outcome).toEqual({ kind: IdempotentCreateOutcomeKindEnum.CREATED, booking: bookingDto() });
  });

  it('locks the key, reads it, locks the room, checks overlap, stores the booking and then the key', async () => {
    await repository.create(command);

    const [keyLock, roomLock] = manager.query.mock.invocationCallOrder;
    const [read] = manager.findOneBy.mock.invocationCallOrder;
    const [check] = manager.existsBy.mock.invocationCallOrder;
    const [booking] = manager.save.mock.invocationCallOrder;
    const [keyRow] = manager.insert.mock.invocationCallOrder;
    const order = [keyLock, read, roomLock, check, booking, keyRow];
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenLastCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      `booking-room:${ROOM_ID}`,
    ]);
    expect(manager.existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: ROOM_ID,
      startsAt: LessThan(command.endsAt),
      endsAt: MoreThan(command.startsAt),
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('answers overlap and stores neither the booking nor the key when the span is taken', async () => {
    manager.existsBy.mockResolvedValue(true);

    await expect(repository.create(command)).resolves.toEqual({ kind: IdempotentCreateOutcomeKindEnum.OVERLAP });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('answers in progress and stores nothing when the lock is held', async () => {
    keyLocked = false;

    await expect(repository.create(command)).resolves.toEqual({ kind: IdempotentCreateOutcomeKindEnum.IN_PROGRESS });
    expect(manager.findOneBy).not.toHaveBeenCalled();
    expect(manager.existsBy).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('answers existing with the stored key and stores nothing when the key is already there', async () => {
    manager.findOneBy.mockResolvedValue(storedKey);

    await expect(repository.create(command)).resolves.toEqual({
      kind: IdempotentCreateOutcomeKindEnum.EXISTING,
      storedKey,
    });
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.existsBy).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('rejects, so the transaction rolls back, when the key row cannot be stored', async () => {
    manager.insert.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

    await expect(repository.create(command)).rejects.toThrow('duplicate key');
  });
});
