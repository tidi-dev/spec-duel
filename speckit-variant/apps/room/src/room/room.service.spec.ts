import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ErrorCodeEnum, PagedRoomsDto, RoomDto } from '@roombook/contract';
import { RoomRepository } from './room.repository';
import { RoomService } from './room.service';

describe('RoomService', () => {
  const room: RoomDto = { id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10', name: 'Room 01', capacity: 2 };
  let service: RoomService;
  let findPage: jest.Mock;
  let findById: jest.Mock;

  beforeEach(async () => {
    findPage = jest.fn();
    findById = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomService, { provide: RoomRepository, useValue: { findPage, findById } }],
    }).compile();
    service = moduleRef.get(RoomService);
  });

  it('lists a page of rooms', async () => {
    const paged: PagedRoomsDto = { items: [room], total: 12, page: 1, limit: 10 };
    findPage.mockResolvedValue(paged);

    await expect(service.listRooms({ page: 1, limit: 10 })).resolves.toBe(paged);
    expect(findPage).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('finds a room by id', async () => {
    findById.mockResolvedValue(room);

    await expect(service.findRoomById(room.id)).resolves.toBe(room);
  });

  it('throws a not found RpcException for an unknown room', async () => {
    findById.mockResolvedValue(null);

    const error = await service.findRoomById(room.id).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND }),
    );
  });
});
