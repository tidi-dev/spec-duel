import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { ErrorCodeEnum, RoomDto, RoomPatternEnum } from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { RoomClient } from './room.client';

describe('RoomClient', () => {
  const room: RoomDto = { id: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10', name: 'Room 01', capacity: 2 };
  let client: RoomClient;
  let send: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomClient, { provide: NATS_CLIENT, useValue: { send } as unknown as ClientProxy }],
    }).compile();
    client = moduleRef.get(RoomClient);
  });

  it('asks the room service for the room by id', async () => {
    send.mockReturnValue(of(room));

    await expect(client.findRoomById(room.id)).resolves.toEqual(room);
    expect(send).toHaveBeenCalledWith(RoomPatternEnum.FIND_BY_ID, { id: room.id });
  });

  it('re-raises a relayed domain error as an RpcException carrying the same object', async () => {
    const relayed = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'Room was not found' };
    send.mockReturnValue(throwError(() => relayed));

    const error = await client.findRoomById(room.id).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toBe(relayed);
  });

  it('passes an unavailable-service RpcException through unchanged', async () => {
    const unavailable = new RpcException({
      statusCode: 503,
      errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE,
      message: 'No service answered room:findRoomById',
    });
    send.mockReturnValue(throwError(() => unavailable));

    await expect(client.findRoomById(room.id)).rejects.toBe(unavailable);
  });
});
