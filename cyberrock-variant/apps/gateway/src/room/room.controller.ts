import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import { ApiRouteEnum, PagedRoomsDto, PageQueryDto, RoomPatternEnum } from '@roombook/contract';

@Controller(ApiRouteEnum.ROOMS)
export class RoomController {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  @Get()
  listRooms(@Query() query: PageQueryDto): Promise<PagedRoomsDto> {
    return NatsRequestUtil.send<PagedRoomsDto, PageQueryDto>(this.client, RoomPatternEnum.LIST, query);
  }
}
