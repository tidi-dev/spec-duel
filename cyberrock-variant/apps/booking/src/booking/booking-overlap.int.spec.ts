import { RpcException } from '@nestjs/microservices';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { BookingDto, ErrorCodeEnum } from '@roombook/contract';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking } from './booking-input';
import { BookingRepository } from './booking.repository';
import { IdempotentBookingRepository, IdempotentCreateDto } from './idempotent-booking.repository';

const describeWithDatabase = process.env['DB_HOST'] ? describe : describe.skip;

const ORGANIZER = 'booking-overlap@int-spec.example';
const OVERLAP = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked in that time span',
};
const OVERLAPPING = [
  ['09:30:00', '10:30:00'],
  ['08:00:00', '09:00:00.001'],
  ['09:15:00', '09:45:00'],
  ['08:00:00', '11:00:00'],
];
const TOUCHING = [
  ['10:00:00', '11:00:00'],
  ['08:00:00', '09:00:00'],
];

const at = (time: string): string => `2030-01-07T${time}Z`;
const instant = (time: string): Date => new Date(at(time));
const iso = (time: string): string => instant(time).toISOString();
const errorOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
const expectOverlap = (error: unknown): void => {
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toEqual(OVERLAP);
};

describeWithDatabase('overlapping room bookings (real database)', () => {
  let dataSource: DataSource;
  let bookings: BookingRepository;
  let idempotentBookings: IdempotentBookingRepository;
  let r1: string;
  let a: BookingDto;
  const keys: string[] = [];

  const commandFor = (roomId: string, from: string, to: string, key: string = randomUUID()): IdempotentCreateDto => {
    keys.push(key);
    const booking = normaliseCreateBooking({
      roomId,
      title: 'Sprint planning',
      organizerEmail: ORGANIZER,
      startsAt: at(from),
      endsAt: at(to),
    });
    return { key, fingerprint: bookingFingerprint(booking), booking };
  };
  const create = async (roomId: string, from: string, to: string): Promise<BookingDto> => {
    const outcome = await idempotentBookings.create(commandFor(roomId, from, to));
    if (outcome.kind !== 'created') {
      throw new Error(`Expected a created booking, got ${outcome.kind}`);
    }
    return outcome.booking;
  };
  const roomRows = (roomId: string): Promise<number> => dataSource.getRepository(BookingEntity).countBy({ roomId });
  const keyRows = (key: string): Promise<number> => dataSource.getRepository(IdempotencyKeyEntity).countBy({ key });
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

  beforeEach(async () => {
    r1 = randomUUID();
    a = await create(r1, '09:00:00', '10:00:00');
  });

  afterAll(async () => {
    await removeRows();
    await dataSource.destroy();
  });

  it.each(OVERLAPPING)('refuses %s to %s next to A on create and on update (BKG-012, BKG-013, BKG-014)', async (from, to) => {
    const b = await create(r1, '14:00:00', '15:00:00');
    const command = commandFor(r1, from, to);

    expectOverlap(await errorOf(idempotentBookings.create(command)));
    expectOverlap(await errorOf(bookings.update(b.id, { startsAt: instant(from), endsAt: instant(to) })));

    expect(await roomRows(r1)).toBe(2);
    expect(await keyRows(command.key)).toBe(0);
    await expect(bookings.findById(b.id)).resolves.toEqual(b);
  });

  it('stores touching spans and the same span in another room on create and on update (BKG-012, BKG-013)', async () => {
    for (const [from, to] of TOUCHING) {
      const created = await create(r1, from, to);
      await bookings.deleteById(created.id);
    }
    await expect(create(randomUUID(), '09:00:00', '10:00:00')).resolves.toMatchObject({ startsAt: a.startsAt });
    const b = await create(r1, '14:00:00', '15:00:00');
    for (const [from, to] of TOUCHING) {
      await expect(bookings.update(b.id, { startsAt: instant(from), endsAt: instant(to) })).resolves.toMatchObject({
        startsAt: iso(from),
        endsAt: iso(to),
      });
    }
  });

  it('refuses B moved one millisecond into A, never A against itself, and allows touching patches (BKG-014)', async () => {
    const b = await create(r1, '10:00:00', '11:00:00');

    expectOverlap(await errorOf(bookings.update(b.id, { startsAt: instant('09:59:59.999') })));
    await expect(bookings.findById(b.id)).resolves.toEqual(b);

    await expect(bookings.update(a.id, { title: 'Retro' })).resolves.toMatchObject({ title: 'Retro' });
    await expect(bookings.update(a.id, { endsAt: instant('09:30:00') })).resolves.toMatchObject({
      endsAt: iso('09:30:00'),
    });
    await expect(bookings.update(b.id, { endsAt: instant('12:00:00') })).resolves.toMatchObject({
      endsAt: iso('12:00:00'),
    });
    await expect(bookings.update(a.id, { startsAt: instant('08:00:00') })).resolves.toMatchObject({
      startsAt: iso('08:00:00'),
    });
  });

  it('replays the request that created a booking instead of refusing it (BKG-013, IDM-003)', async () => {
    const command = commandFor(randomUUID(), '09:00:00', '10:00:00');
    const first = await idempotentBookings.create(command);

    await expect(idempotentBookings.create(command)).resolves.toEqual({ ...first, kind: 'replayed' });
  });

  it('stores nothing against the key of a refused create, so the key works once A is gone (IDM-007)', async () => {
    const command = commandFor(r1, '09:30:00', '10:30:00');

    expectOverlap(await errorOf(idempotentBookings.create(command)));
    expect(await keyRows(command.key)).toBe(0);
    await bookings.deleteById(a.id);

    await expect(idempotentBookings.create(command)).resolves.toMatchObject({ kind: 'created' });
    expect(await roomRows(r1)).toBe(1);
  });
});
