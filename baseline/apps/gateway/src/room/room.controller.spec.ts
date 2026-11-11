import { INestApplication } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { ErrorCodeEnum, PagedRoomsDto, RoomPatternEnum } from '@roombook/contract';
import { AddressInfo } from 'net';
import { of } from 'rxjs';
import { configureGatewayApp } from '../app/configure-gateway-app';
import { RoomController } from './room.controller';

describe('RoomController (gateway)', () => {
  const paged: PagedRoomsDto = { items: [], total: 12, page: 1, limit: 10 };
  let app: INestApplication;
  let baseUrl: string;
  let send: jest.Mock;

  beforeAll(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [{ provide: NATS_CLIENT, useValue: { send } as unknown as ClientProxy }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureGatewayApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/rooms`;
  });

  afterAll(() => app.close());

  beforeEach(() => {
    send.mockReset();
    send.mockReturnValue(of(paged));
  });

  it('forwards the default query to the room list pattern', async () => {
    const response = await fetch(baseUrl);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(paged);
    expect(send).toHaveBeenCalledWith(RoomPatternEnum.LIST, { page: 1, limit: 10 });
  });

  it('converts the query to numbers and drops unknown fields', async () => {
    await fetch(`${baseUrl}?page=1&limit=5&sort=name`);

    expect(send).toHaveBeenCalledWith(RoomPatternEnum.LIST, { page: 1, limit: 5 });
  });

  it.each(['page=0', 'page=-1', 'limit=0', 'limit=101', 'limit=abc'])(
    'rejects %s with 400 without calling the room service',
    async (query) => {
      const response = await fetch(`${baseUrl}?${query}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
});
