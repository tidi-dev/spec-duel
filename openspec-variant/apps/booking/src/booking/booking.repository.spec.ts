import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { BookingRepository } from './booking.repository';
import { BOOKING_ID, bookingDto, bookingEntity, ROOM_ID } from './testing/booking.fixture';

describe('BookingRepository', () => {
  const order = { startsAt: 'ASC', id: 'ASC' };
  let repository: BookingRepository;
  let findAndCount: jest.Mock;
  let findOneBy: jest.Mock;
  let update: jest.Mock;
  let remove: jest.Mock;

  beforeEach(async () => {
    findAndCount = jest.fn().mockResolvedValue([[bookingEntity()], 12]);
    findOneBy = jest.fn().mockResolvedValue(bookingEntity());
    update = jest.fn().mockResolvedValue({ affected: 1 });
    remove = jest.fn().mockResolvedValue({ affected: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: DataSource, useValue: {} },
        {
          provide: getRepositoryToken(BookingEntity),
          useValue: { findAndCount, findOneBy, update, delete: remove },
        },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  it('reads page 1 ordered by start time then id', async () => {
    const page = await repository.findPage({ page: 1, limit: 10 });

    expect(findAndCount).toHaveBeenCalledWith({ where: {}, order, skip: 0, take: 10 });
    expect(page).toEqual({ items: [bookingDto()], total: 12, page: 1, limit: 10 });
  });

  it('skips by the requested limit for page 2 with limit 5', async () => {
    await repository.findPage({ page: 2, limit: 5 });

    expect(findAndCount).toHaveBeenCalledWith({ where: {}, order, skip: 5, take: 5 });
  });

  it('restricts the page to a room', async () => {
    await repository.findPage({ page: 1, limit: 10, roomId: ROOM_ID });

    expect(findAndCount).toHaveBeenCalledWith({ where: { roomId: ROOM_ID }, order, skip: 0, take: 10 });
  });

  it('finds a booking by id', async () => {
    await expect(repository.findById(BOOKING_ID)).resolves.toEqual(bookingDto());
    expect(findOneBy).toHaveBeenCalledWith({ id: BOOKING_ID });
  });

  it('returns null for an unknown id', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(repository.findById(BOOKING_ID)).resolves.toBeNull();
  });

  it('deletes a booking by id', async () => {
    await expect(repository.delete(BOOKING_ID)).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith({ id: BOOKING_ID });
  });

  it('returns false when the deleted id is unknown', async () => {
    remove.mockResolvedValue({ affected: 0 });

    await expect(repository.delete(BOOKING_ID)).resolves.toBe(false);
  });

  it('records a confirmation only on a pending booking whose attempts are not ahead', async () => {
    const outcome = { bookingId: BOOKING_ID, status: ConfirmationStatusEnum.SENT, attempts: 3 };

    await expect(repository.recordConfirmation(outcome)).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      { id: BOOKING_ID, confirmationStatus: ConfirmationStatusEnum.PENDING, confirmationAttempts: LessThanOrEqual(3) },
      { confirmationStatus: ConfirmationStatusEnum.SENT, confirmationAttempts: 3 },
    );
  });

  it('resolves without error when the confirmation matches no row', async () => {
    update.mockResolvedValue({ affected: 0 });

    await expect(
      repository.recordConfirmation({ bookingId: BOOKING_ID, status: ConfirmationStatusEnum.PENDING, attempts: 1 }),
    ).resolves.toBe(false);
  });
});
