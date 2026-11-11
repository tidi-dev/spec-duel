import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoomEntity } from '@roombook/backend-common';
import { FindManyOptions } from 'typeorm';
import { RoomRepository } from './room.repository';

const roomEntity = (name: string, capacity: number): RoomEntity =>
  Object.assign(new RoomEntity(), {
    id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    name,
    capacity,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
  });

describe('RoomRepository', () => {
  let repository: RoomRepository;
  let findAndCount: jest.Mock;
  let findOneBy: jest.Mock;

  beforeEach(async () => {
    findAndCount = jest.fn().mockResolvedValue([[roomEntity('Room 01', 2)], 12]);
    findOneBy = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomRepository, { provide: getRepositoryToken(RoomEntity), useValue: { findAndCount, findOneBy } }],
    }).compile();
    repository = moduleRef.get(RoomRepository);
  });

  it('reads the first page ordered by name', async () => {
    const page = await repository.findPage({ page: 1, limit: 10 });

    expect(findAndCount).toHaveBeenCalledWith({ skip: 0, take: 10, order: { name: 'ASC' } });
    expect(page).toEqual({
      items: [{ id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10', name: 'Room 01', capacity: 2 }],
      total: 12,
      page: 1,
      limit: 10,
    });
  });

  it('skips the rooms of the previous pages', async () => {
    await repository.findPage({ page: 2, limit: 10 });

    expect(findAndCount).toHaveBeenCalledWith({ skip: 10, take: 10, order: { name: 'ASC' } });
  });

  it('skips one page of the requested size for page 2 at 5 per page', async () => {
    await repository.findPage({ page: 2, limit: 5 });

    expect(findAndCount).toHaveBeenCalledWith({ skip: 5, take: 5, order: { name: 'ASC' } });
  });

  it.each([
    { page: 3, limit: 5, skip: 10 },
    { page: 4, limit: 5, skip: 15 },
    { page: 3, limit: 1, skip: 2 },
    { page: 2, limit: 12, skip: 12 },
    { page: 2, limit: 100, skip: 100 },
  ])('skips $skip rooms for page $page at $limit per page', async ({ page, limit, skip }) => {
    await repository.findPage({ page, limit });

    expect(findAndCount).toHaveBeenCalledWith({ skip, take: limit, order: { name: 'ASC' } });
  });

  describe('walking every page', () => {
    const rooms = Array.from({ length: 12 }, (_, index) => roomEntity(`Room ${String(index + 1).padStart(2, '0')}`, 2));
    const roomNames = rooms.map((room) => room.name);

    beforeEach(() => {
      findAndCount.mockImplementation(async (options: FindManyOptions<RoomEntity>) => {
        const skip = options.skip ?? 0;
        const take = options.take ?? rooms.length;
        return [rooms.slice(skip, skip + take), rooms.length];
      });
    });

    it.each([1, 5, 10, 12, 100])('returns each room once in name order at %i per page', async (limit) => {
      const lastPage = Math.ceil(rooms.length / limit);
      const names: string[] = [];

      for (let page = 1; page <= lastPage; page += 1) {
        const result = await repository.findPage({ page, limit });
        expect(result).toMatchObject({ total: 12, page, limit });
        names.push(...result.items.map((item) => item.name));
      }
      expect(names).toEqual(roomNames);

      const afterLast = await repository.findPage({ page: lastPage + 1, limit });
      expect(afterLast).toEqual({ items: [], total: 12, page: lastPage + 1, limit });
    });
  });

  it('finds a room by id', async () => {
    findOneBy.mockResolvedValue(roomEntity('Room 03', 6));

    await expect(repository.findById('3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10')).resolves.toEqual({
      id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
      name: 'Room 03',
      capacity: 6,
    });
    expect(findOneBy).toHaveBeenCalledWith({ id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10' });
  });

  it('returns null for an unknown room', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(repository.findById('3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10')).resolves.toBeNull();
  });
});
