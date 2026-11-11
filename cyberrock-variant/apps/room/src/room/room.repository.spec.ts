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

  describe('paging over 12 rooms (ROOM-001)', () => {
    const roomNames = Array.from({ length: 12 }, (_, index) => `Room ${String(index + 1).padStart(2, '0')}`);

    beforeEach(() => {
      findAndCount.mockImplementation((options: FindManyOptions<RoomEntity>) => {
        const skip = options.skip ?? 0;
        const take = options.take ?? roomNames.length;
        return Promise.resolve([roomNames.slice(skip, skip + take).map((name) => roomEntity(name, 4)), 12]);
      });
    });

    it.each([
      [1, 5, roomNames.slice(0, 5)],
      [2, 5, roomNames.slice(5, 10)],
      [3, 5, ['Room 11', 'Room 12']],
      [4, 5, []],
      [2, 10, ['Room 11', 'Room 12']],
      [12, 1, ['Room 12']],
      [1, 100, roomNames],
    ])('answers page %i of %i per page', async (page, limit, expectedNames) => {
      const paged = await repository.findPage({ page, limit });

      expect(paged.items.map((room) => room.name)).toEqual(expectedNames);
      expect(paged).toMatchObject({ total: 12, page, limit });
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
