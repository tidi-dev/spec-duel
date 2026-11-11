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

describe('IdempotentBookingRepository room lock and overlap check', () => {
  const lockRoomMock = jest.mocked(lockRoom);
  const isRoomSpanTakenMock = jest.mocked(isRoomSpanTaken);
  let repository: IdempotentBookingRepository;
  let manager: Record<'query' | 'findOneBy' | 'save' | 'insert', jest.Mock>;
  let queryRunner: Record<
    'connect' | 'startTransaction' | 'commitTransaction' | 'rollbackTransaction' | 'release',
    jest.Mock
  >;

  beforeEach(async () => {
    lockRoomMock.mockReset().mockResolvedValue(undefined);
    isRoomSpanTakenMock.mockReset().mockResolvedValue(false);
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
        { provide: getRepositoryToken(IdempotencyKeyEntity), useValue: { findOneBy: jest.fn() } },
        { provide: DataSource, useValue: { createQueryRunner: () => ({ ...queryRunner, manager }) } },
      ],
    }).compile();
    repository = moduleRef.get(IdempotentBookingRepository);
  });

  it('reads the stored key, locks the room, checks the span, then inserts', async () => {
    const result = await repository.claim(KEY, FINGERPRINT, booking);

    expect(result.outcome).toBe(ClaimBookingOutcomeEnum.CREATED);
    expect(lockRoomMock).toHaveBeenCalledTimes(1);
    expect(lockRoomMock).toHaveBeenCalledWith(manager, booking.roomId);
    expect(isRoomSpanTakenMock).toHaveBeenCalledTimes(1);
    expect(isRoomSpanTakenMock).toHaveBeenCalledWith(
      manager,
      booking.roomId,
      new Date(booking.startsAt),
      new Date(booking.endsAt),
      null,
    );
    const order = [
      manager.findOneBy.mock.invocationCallOrder[0],
      lockRoomMock.mock.invocationCallOrder[0],
      isRoomSpanTakenMock.mock.invocationCallOrder[0],
      manager.save.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('answers OVERLAP and writes nothing when the span is taken', async () => {
    isRoomSpanTakenMock.mockResolvedValue(true);

    await expect(repository.claim(KEY, FINGERPRINT, booking)).resolves.toEqual({
      outcome: ClaimBookingOutcomeEnum.OVERLAP,
      booking: null,
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  describe('outcomes decided before the room lock', () => {
    afterEach(() => {
      expect(lockRoomMock).not.toHaveBeenCalled();
      expect(isRoomSpanTakenMock).not.toHaveBeenCalled();
    });

    it('IN_PROGRESS when the key-and-fingerprint lock is not obtained', async () => {
      manager.query.mockResolvedValueOnce([{ locked: false }]);

      const result = await repository.claim(KEY, FINGERPRINT, booking);

      expect(result.outcome).toBe(ClaimBookingOutcomeEnum.IN_PROGRESS);
    });

    it('KEY_REUSED when the key lock is not obtained', async () => {
      manager.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ locked: false }]);

      const result = await repository.claim(KEY, FINGERPRINT, booking);

      expect(result.outcome).toBe(ClaimBookingOutcomeEnum.KEY_REUSED);
    });

    it('REPLAYED when the stored row has the same fingerprint', async () => {
      manager.findOneBy.mockResolvedValue(storedRow(FINGERPRINT));

      const result = await repository.claim(KEY, FINGERPRINT, booking);

      expect(result.outcome).toBe(ClaimBookingOutcomeEnum.REPLAYED);
    });

    it('KEY_REUSED when the stored row has another fingerprint', async () => {
      manager.findOneBy.mockResolvedValue(storedRow('b'.repeat(64)));

      const result = await repository.claim(KEY, FINGERPRINT, booking);

      expect(result.outcome).toBe(ClaimBookingOutcomeEnum.KEY_REUSED);
    });
  });
});
