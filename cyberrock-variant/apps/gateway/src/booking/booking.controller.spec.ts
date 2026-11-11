import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { BookingPatternEnum, ErrorCodeEnum } from '@roombook/contract';
import { AddressInfo } from 'net';
import { of, throwError } from 'rxjs';
import { configureGatewayApp } from '../app/configure-gateway-app';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

const R1 = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const K1 = '11111111-1111-4111-8111-111111111111';
const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const B1 = {
  roomId: R1,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};
const booking = { ...B1, id: ID, confirmationStatus: 'PENDING', confirmationAttempts: 0 };

describe('BookingController (gateway)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const send = jest.fn();

  const request = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const post = (body: unknown, headers: Record<string, string> = { 'Idempotency-Key': K1 }) =>
    request('POST', '', body, headers);

  const expectRejected = async (response: Response, errorCode: ErrorCodeEnum): Promise<void> => {
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ statusCode: 400, errorCode }));
    expect(send).not.toHaveBeenCalled();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [BookingService, { provide: NATS_CLIENT, useValue: { send } }],
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

  it('answers 201 with the booking and no replay header for a first create (BKG-001)', async () => {
    send.mockReturnValue(of({ booking, replayed: false }));

    const response = await post(B1);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(booking);
    expect(response.headers.has('Idempotency-Replayed')).toBe(false);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.CREATE, { idempotencyKey: K1, booking: B1 });
  });

  it('answers 201 with Idempotency-Replayed: true for a replay (IDM-003)', async () => {
    send.mockReturnValue(of({ booking, replayed: true }));

    const response = await post(B1);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(booking);
    expect(response.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it.each([
    ['absent', {}],
    ['empty', { 'Idempotency-Key': '' }],
    ['malformed', { 'Idempotency-Key': 'abc' }],
  ])('rejects an %s Idempotency-Key before the body, valid or not (IDM-001)', async (_case, headers) => {
    await expectRejected(await post(B1, headers), ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID);
    await expectRejected(await post({ title: '' }, headers), ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID);
  });

  it.each([
    ['an empty title', { ...B1, title: '' }],
    ['a title of 121 characters', { ...B1, title: 'x'.repeat(121) }],
    ['a bad email', { ...B1, organizerEmail: 'not-an-email' }],
    ['a missing room', { ...B1, roomId: undefined }],
    ['a room that is no UUID', { ...B1, roomId: 'abc' }],
    ['a start that is no date', { ...B1, startsAt: 'tomorrow' }],
  ])('rejects a create with %s without a NATS message (BKG-002)', async (_case, body) => {
    await expectRejected(await post(body), ErrorCodeEnum.VALIDATION);
  });

  it('forwards the list query with defaults and with a room filter (BKG-006)', async () => {
    const paged = { items: [booking], total: 1, page: 1, limit: 10 };
    send.mockReturnValue(of(paged));

    const response = await request('GET', '');
    await request('GET', `?page=2&limit=2&roomId=${R1}&sort=title`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(paged);
    expect(send).toHaveBeenNthCalledWith(1, BookingPatternEnum.LIST, { page: 1, limit: 10 });
    expect(send).toHaveBeenNthCalledWith(2, BookingPatternEnum.LIST, { page: 2, limit: 2, roomId: R1 });
  });

  it.each(['limit=101', 'page=0', 'roomId=abc', 'roomId='])('rejects the list query %s (BKG-006)', async (query) => {
    await expectRejected(await request('GET', `?${query}`), ErrorCodeEnum.VALIDATION);
  });

  it('reads one booking and relays a 404 of the booking service (BKG-007)', async () => {
    const found = await request('GET', `/${ID}`);
    const notFound = { statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'gone' };
    send.mockReturnValue(throwError(() => notFound));
    const missing = await request('GET', `/${ID}`);

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id: ID });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual(notFound);
  });

  it.each(['GET', 'PATCH', 'DELETE'])('rejects the malformed id abc on %s (BKG-007)', async (method) => {
    const body = method === 'PATCH' ? { title: 'Retro' } : undefined;

    await expectRejected(await request(method, '/abc', body), ErrorCodeEnum.VALIDATION);
  });

  it('forwards only the fields an update may change (BKG-008)', async () => {
    const response = await request('PATCH', `/${ID}`, { title: 'Retro', roomId: R1, organizerEmail: 'x@example.com' });
    await request('PATCH', `/${ID}`, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booking);
    expect(send).toHaveBeenNthCalledWith(1, BookingPatternEnum.UPDATE, { id: ID, changes: { title: 'Retro' } });
    expect(send).toHaveBeenNthCalledWith(2, BookingPatternEnum.UPDATE, { id: ID, changes: {} });
  });

  it.each([
    ['an empty title', { title: '' }],
    ['a title of 121 characters', { title: 'x'.repeat(121) }],
    ['a start that is no date', { startsAt: 'tomorrow' }],
  ])('rejects an update with %s without a NATS message (BKG-002)', async (_case, body) => {
    await expectRejected(await request('PATCH', `/${ID}`, body), ErrorCodeEnum.VALIDATION);
  });

  it('answers 204 with an empty body for a delete (BKG-010)', async () => {
    send.mockReturnValue(of({ id: ID }));

    const response = await request('DELETE', `/${ID}`);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.DELETE, { id: ID });
  });
});
