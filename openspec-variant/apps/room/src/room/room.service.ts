import { Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum, PagedRoomsDto, PageQueryDto, RoomDto } from '@roombook/contract';
import { RoomRepository } from './room.repository';

@Injectable()
export class RoomService {
  constructor(private readonly roomRepository: RoomRepository) {}

  listRooms(query: PageQueryDto): Promise<PagedRoomsDto> {
    return this.roomRepository.findPage(query);
  }

  async findRoomById(id: string): Promise<RoomDto> {
    const room = await this.roomRepository.findById(id);
    return room ?? ExceptionHelper.notFound(ErrorCodeEnum.ROOM_NOT_FOUND, `Room ${id} was not found`);
  }
}
