import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { isErrorResponse, NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import { RoomDto, RoomIdMessageDto, RoomPatternEnum } from '@roombook/contract';

@Injectable()
export class RoomClient {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  async findRoomById(id: string): Promise<RoomDto> {
    try {
      return await NatsRequestUtil.send<RoomDto, RoomIdMessageDto>(this.client, RoomPatternEnum.FIND_BY_ID, { id });
    } catch (error) {
      throw isErrorResponse(error) ? new RpcException(error) : error;
    }
  }
}
