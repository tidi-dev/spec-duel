import { randomUUID } from 'node:crypto';
import { Booking, bookingInput, createBooking, ErrorBody, postBooking, rooms } from '../support/bookings';
import { request } from '../support/http';
import { nextSlot, shift } from '../support/slots';

describe('no overlapping bookings in one room', () => {
  it('rejects a booking that overlaps an existing one', async () => {
    const slot = nextSlot();
    await createBooking({}, slot);

    const result = await postBooking<ErrorBody>(await bookingInput({}, shift(slot, 30)));

    expect(result.status).toBe(409);
    expect(result.body.errorCode).toBe('CONFLICT.BOOKING_OVERLAP');
  });

  it('rejects a booking that sits inside an existing one', async () => {
    const slot = nextSlot();
    await createBooking({}, slot);
    const inside = {
      startsAt: shift(slot, 15).startsAt,
      endsAt: shift(slot, -15).endsAt,
    };

    const result = await postBooking<ErrorBody>(await bookingInput({}, inside));

    expect(result.status).toBe(409);
    expect(result.body.errorCode).toBe('CONFLICT.BOOKING_OVERLAP');
  });

  it('allows a booking that starts exactly when another ends', async () => {
    const slot = nextSlot();
    await createBooking({}, slot);

    const result = await postBooking(await bookingInput({}, shift(slot, 60)));

    expect(result.status).toBe(201);
  });

  it('allows the same time in a different room', async () => {
    const [firstRoom, secondRoom] = await rooms();
    const slot = nextSlot();
    await createBooking({ roomId: firstRoom.id }, slot);

    const result = await postBooking(await bookingInput({ roomId: secondRoom.id }, slot));

    expect(result.status).toBe(201);
  });

  it('rejects an update that moves a booking onto another one', async () => {
    const occupied = nextSlot();
    await createBooking({}, occupied);
    const movable = await createBooking();

    const result = await request<ErrorBody>('PATCH', `/bookings/${movable.id}`, {
      body: { startsAt: occupied.startsAt, endsAt: occupied.endsAt },
    });

    expect(result.status).toBe(409);
    expect(result.body.errorCode).toBe('CONFLICT.BOOKING_OVERLAP');
  });

  it('lets a booking be updated without conflicting with itself', async () => {
    const slot = nextSlot();
    const created = await createBooking({}, slot);

    const titleOnly = await request<Booking>('PATCH', `/bookings/${created.id}`, { body: { title: 'Renamed' } });
    const shortened = await request<Booking>('PATCH', `/bookings/${created.id}`, {
      body: { startsAt: slot.startsAt, endsAt: shift(slot, -30).endsAt },
    });

    expect(titleOnly.status).toBe(200);
    expect(shortened.status).toBe(200);
  });

  it('lets exactly one of two overlapping creates through when they arrive at once', async () => {
    const slot = nextSlot();
    const first = await bookingInput({ title: 'Racer one' }, slot);
    const second = await bookingInput({ title: 'Racer two' }, shift(slot, 30));

    const results = await Promise.all([postBooking(first, randomUUID()), postBooking(second, randomUUID())]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
});
