import { randomUUID } from 'node:crypto';
import { Booking, bookingInput, createBooking, getBooking, postBooking } from '../support/bookings';
import { pollUntil, wait } from '../support/poll';

const settled = async (id: string): Promise<Booking> => {
  const result = await pollUntil(
    () => getBooking(id),
    (response) => response.body.confirmationStatus !== 'PENDING',
    30000,
  );
  return result.body;
};

describe('booking confirmation job', () => {
  it('sends the confirmation on the first attempt', async () => {
    const created = await createBooking({ organizerEmail: 'organizer@example.com' });

    const booking = await settled(created.id);

    expect(booking.confirmationStatus).toBe('SENT');
    expect(booking.confirmationAttempts).toBe(1);
  });

  it('retries a failing send and succeeds on the third attempt', async () => {
    const created = await createBooking({ organizerEmail: 'organizer@retry.example' });

    const booking = await settled(created.id);

    expect(booking.confirmationStatus).toBe('SENT');
    expect(booking.confirmationAttempts).toBe(3);
  });

  it('gives up after three attempts', async () => {
    const created = await createBooking({ organizerEmail: 'organizer@bounce.example' });

    const booking = await settled(created.id);

    expect(booking.confirmationStatus).toBe('FAILED');
    expect(booking.confirmationAttempts).toBe(3);
  });

  it('does not send a second confirmation for a replayed create', async () => {
    const key = randomUUID();
    const input = await bookingInput({ organizerEmail: 'organizer@example.com' });
    const first = await postBooking(input, key);
    await settled(first.body.id);

    await postBooking(input, key);
    await wait(3000);

    const booking = (await getBooking(first.body.id)).body;
    expect(booking.confirmationStatus).toBe('SENT');
    expect(booking.confirmationAttempts).toBe(1);
  });
});
