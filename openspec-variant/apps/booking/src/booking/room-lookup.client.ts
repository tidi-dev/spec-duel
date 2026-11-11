import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ExceptionHelper, isErrorResponse, NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import { ErrorCodeEnum, RoomDto, RoomIdMessageDto, RoomPatternEnum } from '@roombook/contract';

@Injectable()
export class RoomLookupClient {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  async assertRoomExists(roomId: string): Promise<void> {
    try {
      await NatsRequestUtil.send<RoomDto, RoomIdMessageDto>(this.client, RoomPatternEnum.FIND_BY_ID, { id: roomId });
    } catch (error) {
      // An error answered by another service arrives as a plain object, not an RpcException.
      if (isErrorResponse(error) && error.errorCode === ErrorCodeEnum.ROOM_NOT_FOUND) {
        ExceptionHelper.notFound(ErrorCodeEnum.ROOM_NOT_FOUND, error.message);
      }
      throw error;
    }
  }
}
