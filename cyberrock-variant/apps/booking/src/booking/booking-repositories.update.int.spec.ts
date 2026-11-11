import { RpcException } from '@nestjs/microservices';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum } from '@roombook/contract';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking } from './booking-input';
import { BookingRepository } from './booking.repository';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

const describeWithDatabase = process.env['DB_HOST'] ? describe : describe.skip;

const ORGANIZER = 'booking-updates@int-spec.example';
const { PENDING, SENT, FAILED } = ConfirmationStatusEnum;

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describeWithDatabase('booking updates and confirmation results (real database)', () => {
  let dataSource: DataSource;
  let bookings: BookingRepository;
  let idempotentBookings: IdempotentBookingRepository;
  const keys: string[] = [];

  const createBooking = async (overrides: Partial<CreateBookingDto> = {}): Promise<BookingDto> => {
    const booking = normaliseCreateBooking({
      roomId: randomUUID(),
      title: 'Sprint planning',
      organizerEmail: ORGANIZER,
      startsAt: '2030-01-07T09:00:00.000Z',
      endsAt: '2030-01-07T10:00:00.000Z',
      ...overrides,
    });
    const key = randomUUID();
    keys.push(key);
    const outcome = await idempotentBookings.create({ key, fingerprint: bookingFingerprint(booking), booking });
    if (outcome.kind !== 'created') {
      throw new Error(`Expected a created booking, got ${outcome.kind}`);
    }
    return outcome.booking;
  };

  const removeRows = async (): Promise<void> => {
    await dataSource.getRepository(BookingEntity).delete({ organizerEmail: ORGANIZER });
    await dataSource.getRepository(IdempotencyKeyEntity).delete({ key: In(keys) });
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT']),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_DATABASE'],
      entities: [BookingEntity, IdempotencyKeyEntity],
      synchronize: false,
    });
    await dataSource.initialize();
    bookings = new BookingRepository(dataSource.getRepository(BookingEntity), dataSource);
    idempotentBookings = new IdempotentBookingRepository(dataSource);
    await removeRows();
  });

  afterAll(async () => {
    await removeRows();
    await dataSource.destroy();
  });

  it('keeps both of two simultaneous partial updates (BKG-009, R-02)', async () => {
    const booking = await createBooking();

    const [titled, extended] = await Promise.all([
      bookings.update(booking.id, { title: 'Retro' }),
      bookings.update(booking.id, { endsAt: new Date('2030-01-07T11:00:00Z') }),
    ]);

    expect(titled?.title).toBe('Retro');
    expect(extended?.endsAt).toBe('2030-01-07T11:00:00.000Z');
    await expect(bookings.findById(booking.id)).resolves.toMatchObject({
      title: 'Retro',
      startsAt: booking.startsAt,
      endsAt: '2030-01-07T11:00:00.000Z',
    });
  });

  it('keeps both a title update and a confirmation result that arrive together (BKG-009)', async () => {
    const booking = await createBooking();

    await Promise.all([
      bookings.update(booking.id, { title: 'Retro' }),
      bookings.recordConfirmation({ bookingId: booking.id, status: SENT, attempts: 1 }),
    ]);

    await expect(bookings.findById(booking.id)).resolves.toMatchObject({
      title: 'Retro',
      confirmationStatus: SENT,
      confirmationAttempts: 1,
    });
  });

  it('moves updatedAt forward on a change and writes nothing when nothing changes (BKG-008)', async () => {
    const booking = await createBooking();

    const unchanged = await bookings.update(booking.id, {});
    await pause(10);
    const retitled = await bookings.update(booking.id, { title: 'Retro' });

    expect(unchanged).toEqual(booking);
    expect(retitled).toEqual({ ...booking, title: 'Retro', updatedAt: expect.any(String) });
    expect(Date.parse(String(retitled?.updatedAt))).toBeGreaterThan(Date.parse(booking.updatedAt));
    await expect(bookings.update(randomUUID(), { title: 'Retro' })).resolves.toBeNull();
  });

  it('refuses an update whose merged span is invalid and leaves the booking unchanged (BKG-004)', async () => {
    const booking = await createBooking();

    const error = await bookings
      .update(booking.id, { startsAt: new Date('2030-01-07T10:00:00Z') })
      .catch((caught: unknown) => caught);

    expect((error as RpcException).getError()).toMatchObject({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION });
    await expect(bookings.findById(booking.id)).resolves.toEqual(booking);
  });

  it('never moves a confirmation result backwards (CNF-006)', async () => {
    const booking = await createBooking();
    const record = (status: ConfirmationStatusEnum, attempts: number): Promise<BookingDto | null> =>
      bookings.recordConfirmation({ bookingId: booking.id, status, attempts });

    await expect(record(PENDING, 2)).resolves.toMatchObject({ confirmationStatus: PENDING, confirmationAttempts: 2 });
    await expect(record(PENDING, 1)).resolves.toMatchObject({ confirmationStatus: PENDING, confirmationAttempts: 2 });
    await expect(record(SENT, 3)).resolves.toMatchObject({ confirmationStatus: SENT, confirmationAttempts: 3 });
    await expect(record(PENDING, 3)).resolves.toMatchObject({ confirmationStatus: SENT, confirmationAttempts: 3 });
    await expect(record(SENT, 3)).resolves.toMatchObject({ confirmationStatus: SENT, confirmationAttempts: 3 });
    await expect(record(FAILED, 4)).resolves.toMatchObject({ confirmationStatus: SENT, confirmationAttempts: 3 });
  });

  it('answers null for a result or a delete of a booking that is gone (CNF-006, BKG-010)', async () => {
    const booking = await createBooking();

    await expect(bookings.deleteById(booking.id)).resolves.toBe(true);
    await expect(bookings.deleteById(booking.id)).resolves.toBe(false);
    await expect(bookings.recordConfirmation({ bookingId: booking.id, status: SENT, attempts: 1 })).resolves.toBeNull();
  });

  it('pages by start then id with the room filter and the real total (BKG-006)', async () => {
    const roomId = randomUUID();
    for (const hour of ['11', '09', '10']) {
      await createBooking({ roomId, startsAt: `2030-01-07T${hour}:00:00Z`, endsAt: `2030-01-07T${hour}:30:00Z` });
    }

    const second = await bookings.findPage({ page: 2, limit: 2, roomId });
    const pastTheEnd = await bookings.findPage({ page: 5, limit: 2, roomId });

    expect(second.items.map((item) => item.startsAt)).toEqual(['2030-01-07T11:00:00.000Z']);
    expect(second).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(pastTheEnd).toEqual({ items: [], total: 3, page: 5, limit: 2 });
  });
});
