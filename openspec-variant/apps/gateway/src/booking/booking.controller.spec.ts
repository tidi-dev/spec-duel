import { INestApplication } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { BookingPatternEnum, ErrorCodeEnum } from '@roombook/contract';
import { AddressInfo } from 'net';
import { of, throwError } from 'rxjs';
import { configureGatewayApp } from '../app/configure-gateway-app';
import { BookingController } from './booking.controller';

describe('BookingController (gateway)', () => {
  const key = '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d';
  const id = '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f';
  const roomId = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
  const body = {
    roomId,
    title: 'Planning',
    organizerEmail: 'ana@example.com',
    startsAt: '2030-01-01T10:00:00+02:00',
    endsAt: '2030-01-01T11:00:00',
  };
  const booking = { ...body, id, confirmationStatus: 'PENDING', confirmationAttempts: 0 };
  let app: INestApplication;
  let baseUrl: string;
  let send: jest.Mock;

  const request = (method: string, path: string, payload?: unknown, idempotencyKey?: string): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

  const expectError = async (response: Response, statusCode: number, errorCode: ErrorCodeEnum): Promise<void> => {
    expect(response.status).toBe(statusCode);
    expect(await response.json()).toEqual({ statusCode, errorCode, message: expect.stringMatching(/.+/) });
  };

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

  it('answers 201 with the booking and forwards the key and the whitelisted body to the create pattern', async () => {
    send.mockReturnValue(of({ booking, replayed: false }));

    const response = await request('POST', '', { ...body, confirmationStatus: 'SENT' }, key);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(booking);
    expect(response.headers.has('Idempotency-Replayed')).toBe(false);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.CREATE, { idempotencyKey: key, booking: body });
  });

  it('answers a replay with 201, the stored booking and Idempotency-Replayed: true', async () => {
    send.mockReturnValue(of({ booking, replayed: true }));

    const response = await request('POST', '', body, key);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(booking);
    expect(response.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it.each([
    ['no key and a valid body', undefined, body],
    ['no key and an invalid body', undefined, { title: '' }],
    ['a key that is not a UUID', 'abc', body],
  ])('rejects a create with %s as 400 BAD_REQUEST.IDEMPOTENCY_KEY without a NATS call', async (_case, sentKey, sent) => {
    await expectError(await request('POST', '', sent, sentKey), 400, ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['no title', { ...body, title: undefined }],
    ['a malformed email', { ...body, organizerEmail: 'not-an-email' }],
    ['a title of 121 characters', { ...body, title: 'x'.repeat(121) }],
    ['a roomId that is not a UUID', { ...body, roomId: 'abc' }],
    ['a startsAt that is not ISO 8601', { ...body, startsAt: 'tomorrow' }],
  ])('rejects a create with %s as 400 BAD_REQUEST.VALIDATION without a NATS call', async (_case, sent) => {
    await expectError(await request('POST', '', sent, key), 400, ErrorCodeEnum.VALIDATION);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards the default list query', async () => {
    const paged = { items: [booking], total: 1, page: 1, limit: 10 };
    send.mockReturnValue(of(paged));

    const response = await request('GET', '');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(paged);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.LIST, { page: 1, limit: 10 });
  });

  it('forwards the page, the limit and the room filter as typed values', async () => {
    await request('GET', `?page=2&limit=5&roomId=${roomId}&sort=title`);

    expect(send).toHaveBeenCalledWith(BookingPatternEnum.LIST, { page: 2, limit: 5, roomId });
  });

  it.each(['page=0', 'limit=101', 'roomId=abc', 'roomId='])(
    'rejects the list query %s as 400 BAD_REQUEST.VALIDATION without a NATS call',
    async (query) => {
      await expectError(await request('GET', `?${query}`), 400, ErrorCodeEnum.VALIDATION);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('forwards a read to the find by id pattern', async () => {
    const response = await request('GET', `/${id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id });
  });

  it('forwards an update with the id and only the contract fields', async () => {
    const response = await request('PATCH', `/${id}`, { title: 'New', organizerEmail: 'x@example.com' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.UPDATE, { id, changes: { title: 'New' } });
  });

  it('forwards an empty update', async () => {
    await request('PATCH', `/${id}`, {});

    expect(send).toHaveBeenCalledWith(BookingPatternEnum.UPDATE, { id, changes: {} });
  });

  it('rejects an invalid update body as 400 BAD_REQUEST.VALIDATION without a NATS call', async () => {
    await expectError(await request('PATCH', `/${id}`, { title: '' }), 400, ErrorCodeEnum.VALIDATION);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards a delete and answers 204 with an empty body', async () => {
    send.mockReturnValue(of(true));

    const response = await request('DELETE', `/${id}`);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.DELETE, { id });
  });

  it.each(['GET', 'PATCH', 'DELETE'])('rejects %s with an id that is not a UUID as 400', async (method) => {
    const payload = method === 'PATCH' ? { title: 'New' } : undefined;

    await expectError(await request(method, '/not-a-uuid', payload), 400, ErrorCodeEnum.VALIDATION);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', `/${id}`, 404, ErrorCodeEnum.BOOKING_NOT_FOUND],
    ['PATCH', `/${id}`, 400, ErrorCodeEnum.VALIDATION],
    ['DELETE', `/${id}`, 404, ErrorCodeEnum.BOOKING_NOT_FOUND],
    ['POST', '', 404, ErrorCodeEnum.ROOM_NOT_FOUND],
    ['POST', '', 409, ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS],
    ['POST', '', 409, ErrorCodeEnum.BOOKING_OVERLAP],
    ['PATCH', `/${id}`, 409, ErrorCodeEnum.BOOKING_OVERLAP],
    ['POST', '', 422, ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED],
    ['POST', '', 503, ErrorCodeEnum.SERVICE_UNAVAILABLE],
  ])('answers %s %s with the %i %s relayed by the booking service', async (method, path, statusCode, errorCode) => {
    send.mockReturnValue(throwError(() => ({ statusCode, errorCode, message: 'relayed' })));
    const payload = method === 'POST' ? body : method === 'PATCH' ? { title: 'New' } : undefined;

    const response = await request(method, path, payload, key);

    await expectError(response, statusCode, errorCode);
    expect(response.headers.has('Idempotency-Replayed')).toBe(false);
  });
});
