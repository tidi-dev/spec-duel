import { renderHook, waitFor } from '@testing-library/react';
import { ErrorCodeEnum } from '@roombook/contract';
import type { PagedRoomsDto, RoomDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { listRooms } from '../../services/room.service';
import { useAllRooms } from './use-all-rooms';

jest.mock('../../services/room.service', () => ({ listRooms: jest.fn() }));

const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

const roomsOf = (count: number): RoomDto[] =>
  Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return { id: `00000000-0000-4000-8000-0000000000${number}`, name: `Room ${number}`, capacity: 4 };
  });

const servePagesOf = (rooms: RoomDto[]) =>
  mockedListRooms.mockImplementation((page, limit) => {
    const paged: PagedRoomsDto = {
      items: rooms.slice((page - 1) * limit, page * limit),
      total: rooms.length,
      page,
      limit,
    };
    return Promise.resolve(paged);
  });

describe('useAllRooms', () => {
  beforeEach(() => mockedListRooms.mockReset());

  it('loads 12 rooms over two pages of 10 (BPG-003, R-16)', async () => {
    const rooms = roomsOf(12);
    servePagesOf(rooms);

    const { result } = renderHook(() => useAllRooms());

    await waitFor(() => expect(result.current.rooms).toHaveLength(12));
    expect(result.current.rooms).toEqual(rooms);
    expect(mockedListRooms.mock.calls).toEqual([
      [1, 10],
      [2, 10],
    ]);
    expect(result.current.error).toBeNull();
  });

  it('asks for one page only when every room fits in it', async () => {
    servePagesOf(roomsOf(10));

    const { result } = renderHook(() => useAllRooms());

    await waitFor(() => expect(result.current.rooms).toHaveLength(10));
    expect(mockedListRooms).toHaveBeenCalledTimes(1);
  });

  it('stops when a page comes back empty before the total is reached', async () => {
    mockedListRooms.mockImplementation((page, limit) =>
      Promise.resolve({ items: page === 1 ? roomsOf(10) : [], total: 25, page, limit }),
    );

    const { result } = renderHook(() => useAllRooms());

    await waitFor(() => expect(result.current.rooms).toHaveLength(10));
    expect(mockedListRooms).toHaveBeenCalledTimes(2);
  });

  it('reports the API message and offers no partial list when a page fails', async () => {
    mockedListRooms.mockImplementation((page, limit) =>
      page === 1
        ? Promise.resolve({ items: roomsOf(10), total: 12, page, limit })
        : Promise.reject(
            new ApiError({
              statusCode: 503,
              errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE,
              message: 'Room service is unavailable',
            }),
          ),
    );

    const { result } = renderHook(() => useAllRooms());

    await waitFor(() => expect(result.current.error).toBe('Room service is unavailable'));
    expect(result.current.rooms).toEqual([]);
  });
});
