import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource } from 'typeorm';
import { BookingRepository } from './booking.repository';

const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';

const entity = (overrides: Partial<BookingEntity> = {}): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: ID,
    roomId: ROOM_ID,
    title: 'Sprint planning',
    organizerEmail: 'ann@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  });

const dto: BookingDto = {
  id: ID,
  roomId: ROOM_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

describe('BookingRepository reads and delete', () => {
  let repository: BookingRepository;
  const bookings = { findAndCount: jest.fn(), count: jest.fn(), findOneBy: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: getRepositoryToken(BookingEntity), useValue: bookings },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  describe('findPage (BKG-006)', () => {
    it('orders by start then id and skips (page - 1) * limit rows', async () => {
      bookings.findAndCount.mockResolvedValue([[entity()], 3]);

      const page = await repository.findPage({ page: 2, limit: 2 });

      expect(bookings.findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { startsAt: 'ASC', id: 'ASC' },
        skip: 2,
        take: 2,
      });
      expect(page).toEqual({ items: [dto], total: 3, page: 2, limit: 2 });
    });

    it('uses the requested limit, not the default page size, for the offset', async () => {
      bookings.findAndCount.mockResolvedValue([[], 0]);

      await repository.findPage({ page: 3, limit: 25 });

      expect(bookings.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25 }));
    });

    it('filters by room when a room id is given', async () => {
      bookings.findAndCount.mockResolvedValue([[], 0]);

      await repository.findPage({ page: 1, limit: 10, roomId: ROOM_ID });

      expect(bookings.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: ROOM_ID } }));
    });

    it('answers an empty page past the end with the real total', async () => {
      bookings.findAndCount.mockResolvedValue([[], 3]);

      await expect(repository.findPage({ page: 9, limit: 10 })).resolves.toEqual({
        items: [],
        total: 3,
        page: 9,
        limit: 10,
      });
    });

    it('answers an empty page with the real total when the offset is beyond what Postgres accepts', async () => {
      bookings.count.mockResolvedValue(3);

      await expect(repository.findPage({ page: 1e30, limit: 10, roomId: ROOM_ID })).resolves.toEqual({
        items: [],
        total: 3,
        page: 1e30,
        limit: 10,
      });
      expect(bookings.count).toHaveBeenCalledWith({ where: { roomId: ROOM_ID } });
      expect(bookings.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('findById (BKG-007)', () => {
    it('maps the row to a booking with UTC millisecond instants', async () => {
      bookings.findOneBy.mockResolvedValue(entity({ startsAt: new Date('2030-01-07T16:00:00+07:00') }));

      await expect(repository.findById(ID)).resolves.toEqual(dto);
      expect(bookings.findOneBy).toHaveBeenCalledWith({ id: ID });
    });

    it('returns null for an unknown booking', async () => {
      bookings.findOneBy.mockResolvedValue(null);

      await expect(repository.findById(ID)).resolves.toBeNull();
    });
  });

  describe('deleteById (BKG-010)', () => {
    it('reports whether a row was removed', async () => {
      bookings.delete.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });

      await expect(repository.deleteById(ID)).resolves.toBe(true);
      await expect(repository.deleteById(ID)).resolves.toBe(false);
      expect(bookings.delete).toHaveBeenCalledWith({ id: ID });
    });
  });
});
