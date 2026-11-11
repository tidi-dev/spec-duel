import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import { PagedRoomsDto, RoomDto, RoomPatternEnum } from '@roombook/contract';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

describe('RoomController', () => {
  const room: RoomDto = { id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10', name: 'Room 01', capacity: 2 };
  let controller: RoomController;
  let listRooms: jest.Mock;
  let findRoomById: jest.Mock;

  beforeEach(async () => {
    listRooms = jest.fn();
    findRoomById = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [{ provide: RoomService, useValue: { listRooms, findRoomById } }],
    }).compile();
    controller = moduleRef.get(RoomController);
  });

  it('answers the room list pattern', async () => {
    const paged: PagedRoomsDto = { items: [room], total: 12, page: 1, limit: 10 };
    listRooms.mockResolvedValue(paged);

    expect(Reflect.getMetadata(PATTERN_METADATA, RoomController.prototype.listRooms)).toEqual([RoomPatternEnum.LIST]);
    await expect(controller.listRooms({ page: 1, limit: 10 })).resolves.toBe(paged);
    expect(listRooms).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('answers the find room by id pattern', async () => {
    findRoomById.mockResolvedValue(room);

    expect(Reflect.getMetadata(PATTERN_METADATA, RoomController.prototype.findRoomById)).toEqual([
      RoomPatternEnum.FIND_BY_ID,
    ]);
    await expect(controller.findRoomById({ id: room.id })).resolves.toBe(room);
    expect(findRoomById).toHaveBeenCalledWith(room.id);
  });
});
