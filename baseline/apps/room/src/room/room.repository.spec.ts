import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoomEntity } from '@roombook/backend-common';
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
