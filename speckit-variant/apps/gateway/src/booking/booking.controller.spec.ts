import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ClientProxy } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import {
  BookingDto,
  BookingPatternEnum,
  ConfirmationStatusEnum,
  ErrorCodeEnum,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  PagedBookingsDto,
} from '@roombook/contract';
import { AddressInfo } from 'net';
import { of } from 'rxjs';
import { configureGatewayApp } from '../app/configure-gateway-app';
import { BookingController } from './booking.controller';
import { IdempotencyKeyGuard } from './idempotency-key.guard';

const KEY = '5d3c8a44-2f0e-4b7a-9c1d-6e8f0a1b2c3d';
const JSON_HEADERS = { 'content-type': 'application/json' };

const body = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const booking: BookingDto = {
  ...body,
  id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T08:00:00.000Z',
  updatedAt: '2029-12-01T08:00:00.000Z',
};

describe('BookingController (gateway)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let send: jest.Mock;

  const post = (payload: unknown): Promise<Response> =>
    fetch(baseUrl, {
      method: 'POST',
      headers: { ...JSON_HEADERS, [IDEMPOTENCY_KEY_HEADER]: KEY },
      body: JSON.stringify(payload),
    });

  const patch = (payload: unknown): Promise<Response> =>
    fetch(`${baseUrl}/${booking.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(payload) });

  beforeAll(async () => {
    send = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [{ provide: NATS_CLIENT, useValue: { send } as unknown as ClientProxy }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureGatewayApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/bookings`;
  });

  afterAll(() => app.close());

  beforeEach(() => {
    send.mockReset();
    send.mockReturnValue(of(booking));
  });

  it('POST forwards the key and the body to the create pattern and answers 201 with the booking', async () => {
    send.mockReturnValue(of({ booking, replayed: false }));

    const response = await post({ ...body, unknown: 'dropped' });

    expect(response.status).toBe(201);
    expect(response.headers.has(IDEMPOTENCY_REPLAYED_HEADER)).toBe(false);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.CREATE, { idempotencyKey: KEY, booking: body });
  });

  it('POST marks a replayed answer with the replay header', async () => {
    send.mockReturnValue(of({ booking, replayed: true }));

    const response = await post(body);

    expect(response.status).toBe(201);
    expect(response.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(await response.json()).toEqual(booking);
  });

  it('POST rejects an invalid body with 400 without calling the booking service', async () => {
    const response = await post({ ...body, organizerEmail: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: ErrorCodeEnum.VALIDATION }));
    expect(send).not.toHaveBeenCalled();
  });

  it('POST carries the idempotency key guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BookingController.prototype.createBooking)).toEqual([
      IdempotencyKeyGuard,
    ]);
  });

  it.each([
    ['a missing key', JSON_HEADERS],
    ['the key abc', { ...JSON_HEADERS, [IDEMPOTENCY_KEY_HEADER]: 'abc' }],
  ])('POST rejects %s before the body is checked', async (_case, headers) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, organizerEmail: 'not-an-email' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ errorCode: ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('GET forwards the query to the list pattern', async () => {
    const paged: PagedBookingsDto = { items: [booking], total: 1, page: 2, limit: 5 };
    send.mockReturnValue(of(paged));

    const response = await fetch(`${baseUrl}?page=2&limit=5&roomId=${body.roomId}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(paged);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.LIST, { page: 2, limit: 5, roomId: body.roomId });
  });

  it('GET rejects a roomId that is not a UUID with 400', async () => {
    const response = await fetch(`${baseUrl}?roomId=abc`);

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('GET :id forwards the id to the find by id pattern', async () => {
    const response = await fetch(`${baseUrl}/${booking.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id: booking.id });
  });

  it.each(['GET', 'PATCH', 'DELETE'])('%s :id rejects an id that is not a UUID with 400', async (method) => {
    const response = await fetch(`${baseUrl}/abc`, { method, headers: JSON_HEADERS });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: ErrorCodeEnum.VALIDATION }));
    expect(send).not.toHaveBeenCalled();
  });

  it('PATCH :id forwards the id and the changes to the update pattern', async () => {
    const response = await patch({ title: 'Planning' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.UPDATE, { id: booking.id, changes: { title: 'Planning' } });
  });

  it.each(['roomId', 'organizerEmail'])('PATCH :id rejects the field %s with 400', async (field) => {
    const response = await patch({ title: 'Planning', [field]: body[field as keyof typeof body] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: ErrorCodeEnum.VALIDATION }));
    expect(send).not.toHaveBeenCalled();
  });

  it('DELETE :id forwards the id to the delete pattern and answers 204 with no body', async () => {
    const response = await fetch(`${baseUrl}/${booking.id}`, { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.DELETE, { id: booking.id });
  });
});
