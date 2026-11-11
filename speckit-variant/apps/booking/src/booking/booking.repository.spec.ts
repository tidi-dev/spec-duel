import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { BookingRepository } from './booking.repository';

const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';
const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';

const bookingEntity = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: BOOKING_ID,
    roomId: ROOM_ID,
    title: 'Weekly sync',
    organizerEmail: 'ada@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2029-12-01T08:00:00.000Z'),
    updatedAt: new Date('2029-12-01T08:00:00.000Z'),
  });

describe('BookingRepository', () => {
  let repository: BookingRepository;
  let findAndCount: jest.Mock;
  let findOneBy: jest.Mock;
  let query: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    findAndCount = jest.fn().mockResolvedValue([[bookingEntity()], 1]);
    findOneBy = jest.fn();
    query = jest.fn();
    update = jest.fn().mockResolvedValue({ affected: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: getRepositoryToken(BookingEntity), useValue: { findAndCount, findOneBy, query, update } },
        { provide: DataSource, useValue: { createQueryRunner: jest.fn() } },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  describe('findPage', () => {
    it('orders by start then id and pages with the requested limit', async () => {
      await expect(repository.findPage({ page: 3, limit: 5 })).resolves.toEqual([[bookingEntity()], 1]);

      expect(findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { startsAt: 'ASC', id: 'ASC' },
        skip: 10,
        take: 5,
      });
    });

    it('restricts rows and total to the room when a roomId is given', async () => {
      await repository.findPage({ page: 1, limit: 10, roomId: ROOM_ID });

      expect(findAndCount).toHaveBeenCalledWith({
        where: { roomId: ROOM_ID },
        order: { startsAt: 'ASC', id: 'ASC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('findById', () => {
    it('returns the booking', async () => {
      const entity = bookingEntity();
      findOneBy.mockResolvedValue(entity);

      await expect(repository.findById(BOOKING_ID)).resolves.toBe(entity);
      expect(findOneBy).toHaveBeenCalledWith({ id: BOOKING_ID });
    });

    it('returns null for an unknown booking', async () => {
      findOneBy.mockResolvedValue(null);

      await expect(repository.findById(BOOKING_ID)).resolves.toBeNull();
    });
  });

  describe('deleteById', () => {
    it('deletes in one statement and returns the deleted booking', async () => {
      const entity = bookingEntity();
      query.mockResolvedValue([[entity], 1]);

      await expect(repository.deleteById(BOOKING_ID)).resolves.toBe(entity);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, parameters] = query.mock.calls[0];
      expect(sql).toMatch(/^DELETE FROM "bookings" WHERE "id" = \$1 RETURNING/);
      expect(parameters).toEqual([BOOKING_ID]);
    });

    it('returns null when the booking does not exist', async () => {
      query.mockResolvedValue([[], 0]);

      await expect(repository.deleteById(BOOKING_ID)).resolves.toBeNull();
    });
  });

  describe('recordConfirmationResult', () => {
    const report = { bookingId: BOOKING_ID, status: ConfirmationStatusEnum.SENT, attempts: 2 };

    it('updates a pending booking whose attempts are not greater, then returns the stored row', async () => {
      const stored = bookingEntity();
      findOneBy.mockResolvedValue(stored);

      await expect(repository.recordConfirmationResult(report)).resolves.toBe(stored);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(
        {
          id: BOOKING_ID,
          confirmationStatus: ConfirmationStatusEnum.PENDING,
          confirmationAttempts: LessThanOrEqual(2),
        },
        { confirmationStatus: ConfirmationStatusEnum.SENT, confirmationAttempts: 2, updatedAt: expect.any(Function) },
      );
      expect(findOneBy).toHaveBeenCalledWith({ id: BOOKING_ID });
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(findOneBy.mock.invocationCallOrder[0]);
    });

    it('returns null when the booking does not exist', async () => {
      update.mockResolvedValue({ affected: 0 });
      findOneBy.mockResolvedValue(null);

      await expect(repository.recordConfirmationResult(report)).resolves.toBeNull();
    });
  });
});
