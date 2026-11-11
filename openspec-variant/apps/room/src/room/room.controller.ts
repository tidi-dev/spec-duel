import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PagedRoomsDto, PageQueryDto, RoomDto, RoomIdMessageDto, RoomPatternEnum } from '@roombook/contract';
import { RoomService } from './room.service';

@Controller()
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @MessagePattern(RoomPatternEnum.LIST)
  listRooms(@Payload() query: PageQueryDto): Promise<PagedRoomsDto> {
    return this.roomService.listRooms(query);
  }

  @MessagePattern(RoomPatternEnum.FIND_BY_ID)
  findRoomById(@Payload() message: RoomIdMessageDto): Promise<RoomDto> {
    return this.roomService.findRoomById(message.id);
  }
}
