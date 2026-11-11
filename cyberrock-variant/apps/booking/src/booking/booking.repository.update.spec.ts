import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { DataSource, LessThanOrEqual, Not, QueryFailedError } from 'typeorm';
import { BookingRepository } from './booking.repository';

const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const { PENDING, SENT } = ConfirmationStatusEnum;

const entity = (overrides: Partial<BookingEntity> = {}): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: ID,
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Sprint planning',
    organizerEmail: 'ann@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  });

const spanViolation = (): QueryFailedError =>
  new QueryFailedError('UPDATE', [], Object.assign(new Error('violates check'), { constraint: 'CHK_bookings_span' }));

describe('BookingRepository writes', () => {
  let repository: BookingRepository;
  const bookings = { findOneBy: jest.fn(), update: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    query: jest.fn(),
    existsBy: jest.fn(),
    update: jest.fn(),
    findOneByOrFail: jest.fn(),
  };
  const transaction = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((work: (transactionManager: typeof manager) => unknown) => work(manager));
    manager.existsBy.mockResolvedValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: getRepositoryToken(BookingEntity), useValue: bookings },
        { provide: DataSource, useValue: { transaction } },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  describe('update (BKG-008, BKG-009)', () => {
    it('locks the row, writes only the changed column and answers the stored result', async () => {
      manager.findOne.mockResolvedValue(entity());
      manager.findOneByOrFail.mockResolvedValue(
        entity({ title: 'Retro', updatedAt: new Date('2030-01-02T00:00:00.000Z') }),
      );

      const result = await repository.update(ID, { title: 'Retro' });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(BookingEntity, {
        where: { id: ID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(BookingEntity, { id: ID }, { title: 'Retro' });
      expect(result).toMatchObject({
        title: 'Retro',
        endsAt: '2030-01-07T10:00:00.000Z',
        updatedAt: '2030-01-02T00:00:00.000Z',
      });
    });

    it('writes nothing and answers the booking when no value changes', async () => {
      manager.findOne.mockResolvedValue(entity());

      await expect(repository.update(ID, {})).resolves.toMatchObject({ id: ID, title: 'Sprint planning' });
      await expect(repository.update(ID, { title: 'Sprint planning' })).resolves.toMatchObject({
        updatedAt: '2030-01-01T00:00:00.000Z',
      });
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('returns null for an unknown booking without writing', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(repository.update(ID, { title: 'Retro' })).resolves.toBeNull();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects a start that reaches the stored end with 400 and writes nothing (BKG-004)', async () => {
      manager.findOne.mockResolvedValue(entity());

      const error = await repository
        .update(ID, { startsAt: new Date('2030-01-07T10:00:00.000Z') })
        .catch((caught: unknown) => caught);

      expect((error as RpcException).getError()).toEqual(
        expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('maps a CHK_bookings_span violation to the same 400 (BKG-011)', async () => {
      manager.findOne.mockResolvedValue(entity());
      manager.update.mockRejectedValue(spanViolation());

      const error = await repository
        .update(ID, { endsAt: new Date('2030-01-07T11:00:00.000Z') })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toEqual({
        statusCode: 400,
        errorCode: ErrorCodeEnum.VALIDATION,
        message: 'endsAt must be later than startsAt',
      });
    });

    it('passes any other database error through', async () => {
      const failure = new QueryFailedError('UPDATE', [], new Error('connection lost'));
      manager.findOne.mockResolvedValue(entity());
      manager.update.mockRejectedValue(failure);

      await expect(repository.update(ID, { title: 'Retro' })).rejects.toBe(failure);
    });
  });

  describe('recordConfirmation (CNF-006)', () => {
    it('updates only a booking that is not SENT and has no higher attempt count', async () => {
      bookings.findOneBy.mockResolvedValue(entity({ confirmationStatus: SENT, confirmationAttempts: 3 }));

      const result = await repository.recordConfirmation({ bookingId: ID, status: SENT, attempts: 3 });

      expect(bookings.update).toHaveBeenCalledTimes(1);
      expect(bookings.update).toHaveBeenCalledWith(
        { id: ID, confirmationStatus: Not(SENT), confirmationAttempts: LessThanOrEqual(3) },
        { confirmationStatus: SENT, confirmationAttempts: 3 },
      );
      expect(result).toMatchObject({ id: ID, confirmationStatus: SENT, confirmationAttempts: 3 });
    });

    it('answers the stored booking when the result was late', async () => {
      bookings.findOneBy.mockResolvedValue(entity({ confirmationStatus: SENT, confirmationAttempts: 1 }));

      await expect(
        repository.recordConfirmation({ bookingId: ID, status: PENDING, attempts: 1 }),
      ).resolves.toMatchObject({ confirmationStatus: SENT, confirmationAttempts: 1 });
    });

    it('returns null for an unknown booking', async () => {
      bookings.findOneBy.mockResolvedValue(null);

      await expect(repository.recordConfirmation({ bookingId: ID, status: SENT, attempts: 1 })).resolves.toBeNull();
    });
  });
});
