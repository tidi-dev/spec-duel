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

const ORGANIZER = 'booking-overlap-concurrency@int-spec.example';
const OVERLAP = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked in that time span',
};
const ROUNDS = 5;

const at = (time: string): string => `2030-01-07T${time}Z`;
const instant = (time: string): Date => new Date(at(time));
const iso = (time: string): string => instant(time).toISOString();
const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
const expectOverlap = (error: unknown): void => {
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toEqual(OVERLAP);
};
const expectOneWinner = (settled: PromiseSettledResult<unknown>[]): void => {
  expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const reasons: unknown[] = settled.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  expect(reasons).toHaveLength(1);
  expectOverlap(reasons[0]);
};

describeWithDatabase('concurrent span writes of one room (real database)', () => {
  let dataSource: DataSource;
  let bookings: BookingRepository;
  let idempotentBookings: IdempotentBookingRepository;
  let r1: string;
  let a: BookingDto;
  const keys: string[] = [];

  const commandFor = (roomId: string, from: string, to: string): IdempotentCreateDto => {
    const key = randomUUID();
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

  it('makes a create wait for the lock of its room before it checks or writes (BKG-015, R-09)', async () => {
    const roomId = randomUUID();
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (holding = resolve));
    const holder = dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended('room:' || $1, 0))`, [roomId]);
      holding();
      await released;
    });
    await held;
    let settled = false;

    const waiting = idempotentBookings.create(commandFor(roomId, '09:00:00', '10:00:00')).finally(() => {
      settled = true;
    });
    await pause(300);
    const [settledWhileLocked, rowsWhileLocked] = [settled, await roomRows(roomId)];
    release();
    await holder;

    await expect(waiting).resolves.toMatchObject({ kind: 'created' });
    expect(settledWhileLocked).toBe(false);
    expect(rowsWhileLocked).toBe(0);
  });

  it('lets exactly one of two simultaneous overlapping creates win (BKG-015, R-09)', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const r2 = randomUUID();
      const settled = await Promise.allSettled([
        idempotentBookings.create(commandFor(r2, '09:00:00', '10:00:00')),
        idempotentBookings.create(commandFor(r2, '09:30:00', '10:30:00')),
      ]);

      expectOneWinner(settled);
      expect(settled).toContainEqual(expect.objectContaining({ value: expect.objectContaining({ kind: 'created' }) }));
      expect(await roomRows(r2)).toBe(1);
    }
  });

  it('lets exactly one of two simultaneous updates into each other win (BKG-015, R-09)', async () => {
    const c = await create(r1, '11:00:00', '12:00:00');
    for (let round = 0; round < ROUNDS; round += 1) {
      const settled = await Promise.allSettled([
        bookings.update(a.id, { endsAt: instant('10:45:00') }),
        bookings.update(c.id, { startsAt: instant('10:15:00') }),
      ]);

      expectOneWinner(settled);
      const [first, second] = [await bookings.findById(a.id), await bookings.findById(c.id)];
      expect(Date.parse(String(first?.endsAt))).toBeLessThanOrEqual(Date.parse(String(second?.startsAt)));
      await bookings.update(a.id, { endsAt: instant('10:00:00') });
      await bookings.update(c.id, { startsAt: instant('11:00:00') });
    }
  });

  it('keeps both simultaneous partial span updates, checked as the merged span (BKG-014, R-02)', async () => {
    await create(r1, '10:30:00', '11:30:00');

    await Promise.all([
      bookings.update(a.id, { startsAt: instant('08:30:00') }),
      bookings.update(a.id, { endsAt: instant('10:30:00') }),
    ]);

    await expect(bookings.findById(a.id)).resolves.toMatchObject({
      startsAt: iso('08:30:00'),
      endsAt: iso('10:30:00'),
    });
    expectOverlap(await errorOf(bookings.update(a.id, { endsAt: instant('10:30:00.001') })));
  });

  it('answers the same 409 when only EXCL_bookings_room_span stops the write (BKG-016, R-09)', async () => {
    const roomId = randomUUID();
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (holding = resolve));
    const holder = dataSource.transaction(async (manager) => {
      const unlocked = commandFor(roomId, '09:00:00', '10:00:00').booking;
      await manager.insert(BookingEntity, unlocked);
      holding();
      await released;
    });
    await held;
    const command = commandFor(roomId, '09:30:00', '10:30:00');

    const refused = errorOf(idempotentBookings.create(command));
    await pause(200);
    release();
    await holder;

    expectOverlap(await refused);
    expect(await roomRows(roomId)).toBe(1);
    expect(await keyRows(command.key)).toBe(0);
  });
});
