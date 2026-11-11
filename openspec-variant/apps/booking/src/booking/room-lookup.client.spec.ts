import { RpcException } from '@nestjs/microservices';
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { ErrorCodeEnum, RoomPatternEnum } from '@roombook/contract';
import { of, throwError } from 'rxjs';
import { RoomLookupClient } from './room-lookup.client';
import { ROOM_ID } from './testing/booking.fixture';

describe('RoomLookupClient', () => {
  let client: RoomLookupClient;
  let send: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomLookupClient, { provide: NATS_CLIENT, useValue: { send } }],
    }).compile();
    client = moduleRef.get(RoomLookupClient);
  });

  it('resolves when the room service knows the room', async () => {
    send.mockReturnValue(of({ id: ROOM_ID, name: 'Room 01', capacity: 2 }));

    await expect(client.assertRoomExists(ROOM_ID)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(RoomPatternEnum.FIND_BY_ID, { id: ROOM_ID });
  });

  it('re-raises the relayed NOT_FOUND.ROOM object as a 404 RpcException', async () => {
    const relayed = { statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'Room was not found' };
    send.mockReturnValue(throwError(() => relayed));

    const error = await client.assertRoomExists(ROOM_ID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(relayed);
  });

  it('lets 503 UNAVAILABLE.SERVICE pass when the room service does not answer', async () => {
    send.mockReturnValue(throwError(() => new EmptyResponseException(RoomPatternEnum.FIND_BY_ID)));

    const error = await client.assertRoomExists(ROOM_ID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE }),
    );
  });

  it('rethrows any other error unchanged', async () => {
    const unknown = { status: 'error', message: 'Internal server error' };
    send.mockReturnValue(throwError(() => unknown));

    await expect(client.assertRoomExists(ROOM_ID)).rejects.toBe(unknown);
  });
});
