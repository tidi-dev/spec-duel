import type { PagedRoomsDto } from '@roombook/contract';
import { apiClient } from './api-client';
import { listRooms } from './room.service';

jest.mock('./api-client', () => ({ apiClient: { get: jest.fn() } }));

const mockedGet = apiClient.get as jest.Mock;

describe('listRooms', () => {
  beforeEach(() => mockedGet.mockReset());

  it('requests GET /rooms with the given page and limit and returns the body', async () => {
    const body: PagedRoomsDto = {
      items: [{ id: 'a1b2c3d4-0000-4000-8000-000000000006', name: 'Room 06', capacity: 12 }],
      total: 12,
      page: 2,
      limit: 5,
    };
    mockedGet.mockResolvedValue({ data: body });

    const result = await listRooms(2, 5);

    expect(mockedGet).toHaveBeenCalledWith('/rooms', { params: { page: 2, limit: 5 } });
    expect(result).toEqual(body);
  });

  it('propagates a rejected request', async () => {
    const failure = new Error('boom');
    mockedGet.mockRejectedValue(failure);

    await expect(listRooms(1, 10)).rejects.toBe(failure);
  });
});
