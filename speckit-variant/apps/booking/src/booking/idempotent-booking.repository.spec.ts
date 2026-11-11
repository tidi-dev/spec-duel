import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, CreateBookingDto } from '@roombook/contract';
import { DataSource } from 'typeorm';
import { isRoomSpanTaken, lockRoom } from './booking-overlap.query';
import { toBookingDto } from './booking.mapper';
import { ClaimBookingOutcomeEnum } from './claim-booking-result.dto';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

jest.mock('./booking-overlap.query');

const KEY = '5d3c8a44-2f0e-4b7a-9c1d-6e8f0a1b2c3d';
const FINGERPRINT = 'a'.repeat(64);
const TRY_LOCK_SQL = 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS "locked"';

const booking: CreateBookingDto = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const savedBooking = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
    roomId: booking.roomId,
    title: booking.title,
    organizerEmail: booking.organizerEmail,
    startsAt: new Date(booking.startsAt),
    endsAt: new Date(booking.endsAt),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2029-12-01T08:00:00.000Z'),
    updatedAt: new Date('2029-12-01T08:00:00.000Z'),
  });

const storedRow = (requestFingerprint: string): IdempotencyKeyEntity =>
  Object.assign(new IdempotencyKeyEntity(), {
    key: KEY,
    requestFingerprint,
    responseStatus: 201,
    responseBody: toBookingDto(savedBooking()),
    createdAt: new Date('2029-12-01T08:00:00.000Z'),
  });

describe('IdempotentBookingRepository', () => {
  let repository: IdempotentBookingRepository;
  let findStoredKey: jest.Mock;
  let manager: Record<'query' | 'findOneBy' | 'save' | 'insert', jest.Mock>;
  let queryRunner: Record<
    'connect' | 'startTransaction' | 'commitTransaction' | 'rollbackTransaction' | 'release',
    jest.Mock
  >;

  const expectNothingInserted = (): void => {
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  };

  beforeEach(async () => {
    jest.mocked(lockRoom).mockResolvedValue(undefined);
    jest.mocked(isRoomSpanTaken).mockResolvedValue(false);
    findStoredKey = jest.fn();
    manager = {
      query: jest.fn().mockResolvedValue([{ locked: true }]),
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(savedBooking()),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotentBookingRepository,
        { provide: getRepositoryToken(IdempotencyKeyEntity), useValue: { findOneBy: findStoredKey } },
        { provide: DataSource, useValue: { createQueryRunner: () => ({ ...queryRunner, manager }) } },
      ],
    }).compile();
    repository = moduleRef.get(IdempotentBookingRepository);
  });

  describe('findByKey', () => {
    it.each([['the stored row', storedRow(FINGERPRINT)], ['null for an unused key', null]])(
      'returns %s',
      async (_case, row) => {
        findStoredKey.mockResolvedValue(row);

        await expect(repository.findByKey(KEY)).resolves.toBe(row);
        expect(findStoredKey).toHaveBeenCalledWith({ key: KEY });
      },
    );
  });

  describe('claim', () => {
    it('locks, reads, then inserts the booking and the idempotency row in one transaction', async () => {
      const result = await repository.claim(KEY, FINGERPRINT, booking);

      expect(result).toEqual({ outcome: ClaimBookingOutcomeEnum.CREATED, booking: toBookingDto(savedBooking()) });
      expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(manager.query.mock.calls).toEqual([
        [TRY_LOCK_SQL, [`${KEY}:${FINGERPRINT}`]],
        [TRY_LOCK_SQL, [KEY]],
      ]);
      expect(manager.findOneBy).toHaveBeenCalledWith(IdempotencyKeyEntity, { key: KEY });
      expect(manager.save).toHaveBeenCalledWith(BookingEntity, {
        roomId: booking.roomId,
        title: booking.title,
        organizerEmail: booking.organizerEmail,
        startsAt: new Date(booking.startsAt),
        endsAt: new Date(booking.endsAt),
      });
      expect(manager.insert).toHaveBeenCalledWith(IdempotencyKeyEntity, {
        key: KEY,
        requestFingerprint: FINGERPRINT,
        responseStatus: 201,
        responseBody: toBookingDto(savedBooking()),
      });
      expect(manager.findOneBy.mock.invocationCallOrder[0]).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and rejects when the idempotency row cannot be inserted', async () => {
      const failure = new Error('duplicate key value violates unique constraint');
      manager.insert.mockRejectedValue(failure);

      await expect(repository.claim(KEY, FINGERPRINT, booking)).rejects.toBe(failure);

      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('answers IN_PROGRESS when the key-and-fingerprint lock is not obtained', async () => {
      manager.query.mockResolvedValueOnce([{ locked: false }]);

      await expect(repository.claim(KEY, FINGERPRINT, booking)).resolves.toEqual({
        outcome: ClaimBookingOutcomeEnum.IN_PROGRESS,
        booking: null,
      });
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.findOneBy).not.toHaveBeenCalled();
      expectNothingInserted();
    });

    it('answers KEY_REUSED when the key lock is not obtained', async () => {
      manager.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ locked: false }]);

      await expect(repository.claim(KEY, FINGERPRINT, booking)).resolves.toEqual({
        outcome: ClaimBookingOutcomeEnum.KEY_REUSED,
        booking: null,
      });
      expect(manager.findOneBy).not.toHaveBeenCalled();
      expectNothingInserted();
    });

    it('answers REPLAYED with the stored body when the row has the same fingerprint', async () => {
      const row = storedRow(FINGERPRINT);
      manager.findOneBy.mockResolvedValue(row);

      await expect(repository.claim(KEY, FINGERPRINT, booking)).resolves.toEqual({
        outcome: ClaimBookingOutcomeEnum.REPLAYED,
        booking: row.responseBody,
      });
      expectNothingInserted();
    });

    it('answers KEY_REUSED when the row has another fingerprint', async () => {
      manager.findOneBy.mockResolvedValue(storedRow('b'.repeat(64)));

      await expect(repository.claim(KEY, FINGERPRINT, booking)).resolves.toEqual({
        outcome: ClaimBookingOutcomeEnum.KEY_REUSED,
        booking: null,
      });
      expectNothingInserted();
    });
  });
});
