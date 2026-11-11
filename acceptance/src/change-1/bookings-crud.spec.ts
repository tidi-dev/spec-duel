import { randomUUID } from 'node:crypto';
import {
  Booking,
  bookingInput,
  createBooking,
  ErrorBody,
  getBooking,
  listRoomBookings,
  Paged,
  postBooking,
  rooms,
  sameInstant,
} from '../support/bookings';
import { get, request } from '../support/http';
import { nextSlot } from '../support/slots';

describe('bookings CRUD', () => {
  it('creates a booking and returns it', async () => {
    const input = await bookingInput({ title: 'Design review' });

    const result = await postBooking(input);

    expect(result.status).toBe(201);
    expect(result.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.body.roomId).toBe(input.roomId);
    expect(result.body.title).toBe('Design review');
    expect(result.body.organizerEmail).toBe(input.organizerEmail);
    expect(sameInstant(result.body.startsAt, input.startsAt)).toBe(true);
    expect(sameInstant(result.body.endsAt, input.endsAt)).toBe(true);
    expect(['PENDING', 'SENT']).toContain(result.body.confirmationStatus);
    expect(typeof result.body.createdAt).toBe('string');
    expect(typeof result.body.updatedAt).toBe('string');
  });

  it('reads a booking by id', async () => {
    const created = await createBooking();

    const result = await getBooking(created.id);

    expect(result.status).toBe(200);
    expect(result.body.id).toBe(created.id);
    expect(result.body.title).toBe(created.title);
  });

  it('answers 404 for an unknown booking', async () => {
    const result = await get<ErrorBody>(`/bookings/${randomUUID()}`);

    expect(result.status).toBe(404);
    expect(result.body.errorCode).toBe('NOT_FOUND.BOOKING');
  });

  it('lists bookings of a room ordered by start time', async () => {
    const [, secondRoom] = await rooms();
    const later = nextSlot();
    const earlier = nextSlot();
    const first = await createBooking({ roomId: secondRoom.id, startsAt: later.startsAt, endsAt: later.endsAt });
    const second = await createBooking({ roomId: secondRoom.id, startsAt: earlier.startsAt, endsAt: earlier.endsAt });

    const listed = await listRoomBookings(secondRoom.id);

    const ids = listed.map((booking) => booking.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(listed.every((booking) => booking.roomId === secondRoom.id)).toBe(true);
    const starts = listed.map((booking) => Date.parse(booking.startsAt));
    expect(starts).toEqual([...starts].sort((left, right) => left - right));
  });

  it('pages the booking list', async () => {
    const result = await get<Paged<Booking>>('/bookings?page=1&limit=1');

    expect(result.status).toBe(200);
    expect(result.body.items.length).toBeLessThanOrEqual(1);
    expect(result.body.page).toBe(1);
    expect(result.body.limit).toBe(1);
    expect(typeof result.body.total).toBe('number');
  });

  it('updates the title and the times', async () => {
    const created = await createBooking();
    const moved = nextSlot();

    const result = await request<Booking>('PATCH', `/bookings/${created.id}`, {
      body: { title: 'Moved', startsAt: moved.startsAt, endsAt: moved.endsAt },
    });

    expect(result.status).toBe(200);
    expect(result.body.title).toBe('Moved');
    expect(sameInstant(result.body.startsAt, moved.startsAt)).toBe(true);
    expect(sameInstant(result.body.endsAt, moved.endsAt)).toBe(true);
    const reread = await getBooking(created.id);
    expect(reread.body.title).toBe('Moved');
  });

  it('answers 404 when updating an unknown booking', async () => {
    const result = await request<ErrorBody>('PATCH', `/bookings/${randomUUID()}`, { body: { title: 'Nobody' } });

    expect(result.status).toBe(404);
    expect(result.body.errorCode).toBe('NOT_FOUND.BOOKING');
  });

  it('deletes a booking', async () => {
    const created = await createBooking();

    const deleted = await request('DELETE', `/bookings/${created.id}`);
    const reread = await get<ErrorBody>(`/bookings/${created.id}`);

    expect(deleted.status).toBe(204);
    expect(reread.status).toBe(404);
    expect(reread.body.errorCode).toBe('NOT_FOUND.BOOKING');
  });

  it('rejects a booking that ends before it starts', async () => {
    const slot = nextSlot();
    const input = await bookingInput({ startsAt: slot.endsAt, endsAt: slot.startsAt });

    const result = await postBooking(input);

    expect(result.status).toBe(400);
  });

  it('rejects a booking that ends exactly when it starts', async () => {
    const slot = nextSlot();
    const input = await bookingInput({ startsAt: slot.startsAt, endsAt: slot.startsAt });

    const result = await postBooking(input);

    expect(result.status).toBe(400);
  });

  it('rejects an invalid body', async () => {
    const input = await bookingInput({ organizerEmail: 'not-an-email' });

    const result = await postBooking(input);

    expect(result.status).toBe(400);
  });

  it('answers 404 for an unknown room', async () => {
    const input = await bookingInput({ roomId: randomUUID() });

    const result = await postBooking<ErrorBody>(input);

    expect(result.status).toBe(404);
    expect(result.body.errorCode).toBe('NOT_FOUND.ROOM');
  });
});
