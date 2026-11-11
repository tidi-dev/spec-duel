import { randomUUID } from 'node:crypto';
import {
  bookingInput,
  ErrorBody,
  IDEMPOTENCY_REPLAYED,
  listRoomBookings,
  postBooking,
  sameInstant,
} from '../support/bookings';

describe('idempotent create', () => {
  it('rejects a create without the Idempotency-Key header', async () => {
    const result = await postBooking<ErrorBody>(await bookingInput(), null);

    expect(result.status).toBe(400);
    expect(result.body.errorCode).toBe('BAD_REQUEST.IDEMPOTENCY_KEY');
  });

  it('rejects a key that is not a UUID', async () => {
    const result = await postBooking<ErrorBody>(await bookingInput(), 'not-a-uuid');

    expect(result.status).toBe(400);
    expect(result.body.errorCode).toBe('BAD_REQUEST.IDEMPOTENCY_KEY');
  });

  it('replays the stored response for the same key and body', async () => {
    const key = randomUUID();
    const input = await bookingInput({ title: 'Replay me' });

    const first = await postBooking(input, key);
    const second = await postBooking(input, key);

    expect(first.status).toBe(201);
    expect(first.headers.get(IDEMPOTENCY_REPLAYED)).not.toBe('true');
    expect(second.status).toBe(201);
    expect(second.headers.get(IDEMPOTENCY_REPLAYED)).toBe('true');
    expect(second.body).toEqual(first.body);
    const sameSlot = (await listRoomBookings(input.roomId)).filter((booking) =>
      sameInstant(booking.startsAt, input.startsAt),
    );
    expect(sameSlot).toHaveLength(1);
  });

  it('rejects the same key with a different body', async () => {
    const key = randomUUID();
    const input = await bookingInput({ title: 'Original' });
    await postBooking(input, key);

    const result = await postBooking<ErrorBody>({ ...input, title: 'Changed' }, key);

    expect(result.status).toBe(422);
    expect(result.body.errorCode).toBe('UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED');
  });

  it('creates one booking when the same request arrives twice at once', async () => {
    const key = randomUUID();
    const input = await bookingInput({ title: 'Twice at once' });

    const results = await Promise.all([postBooking(input, key), postBooking(input, key)]);

    const statuses = results.map((result) => result.status).sort();
    expect([
      [201, 201],
      [201, 409],
    ]).toContainEqual(statuses);
    const sameSlot = (await listRoomBookings(input.roomId)).filter((booking) =>
      sameInstant(booking.startsAt, input.startsAt),
    );
    expect(sameSlot).toHaveLength(1);
  });

  it('does not store a validation failure against the key', async () => {
    const key = randomUUID();
    const input = await bookingInput({ title: 'Second try works' });

    const invalid = await postBooking({ ...input, organizerEmail: 'not-an-email' }, key);
    const valid = await postBooking(input, key);

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(201);
  });
});
