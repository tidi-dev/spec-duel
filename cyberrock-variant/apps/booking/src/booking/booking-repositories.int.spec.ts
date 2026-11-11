import { RpcException } from '@nestjs/microservices';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum } from '@roombook/contract';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking } from './booking-input';
import { BookingRepository } from './booking.repository';
import { IdempotentBookingRepository, IdempotentCreateDto } from './idempotent-booking.repository';

const describeWithDatabase = process.env['DB_HOST'] ? describe : describe.skip;

const ORGANIZER = 'idempotent-create@int-spec.example';
const TEN_ORGANIZER = 'ten-creates@int-spec.example';
const SPAN_ORGANIZER = 'span@int-spec.example';
const ROLLBACK_ORGANIZER = 'rollback@int-spec.example';
const ORGANIZERS = [ORGANIZER, TEN_ORGANIZER, SPAN_ORGANIZER, ROLLBACK_ORGANIZER];

const body = (overrides: Partial<CreateBookingDto> = {}): CreateBookingDto => ({
  roomId: randomUUID(),
  title: 'Sprint planning',
  organizerEmail: ORGANIZER,
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  ...overrides,
});

describeWithDatabase('idempotent booking create (real database)', () => {
  let dataSource: DataSource;
  let bookings: BookingRepository;
  let idempotentBookings: IdempotentBookingRepository;
  const keys: string[] = [];

  const commandFor = (request: CreateBookingDto, key: string = randomUUID()): IdempotentCreateDto => {
    keys.push(key);
    const booking = normaliseCreateBooking(request);
    return { key, fingerprint: bookingFingerprint(booking), booking };
  };

  const keyRows = (key: string): Promise<number> => dataSource.getRepository(IdempotencyKeyEntity).countBy({ key });
  const bookingRows = (organizerEmail: string): Promise<number> =>
    dataSource.getRepository(BookingEntity).countBy({ organizerEmail });
  const removeRows = async (): Promise<void> => {
    await dataSource.getRepository(BookingEntity).delete({ organizerEmail: In(ORGANIZERS) });
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

  it('lets exactly one of ten simultaneous creates with one key create the booking (IDM-006, R-09)', async () => {
    const command = commandFor(body({ organizerEmail: TEN_ORGANIZER }));

    const outcomes = await Promise.all(Array.from({ length: 10 }, () => idempotentBookings.create(command)));

    const kinds = outcomes.map((outcome) => outcome.kind);
    expect(kinds.filter((kind) => kind === 'created')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'reused')).toHaveLength(0);
    const stored = await dataSource.getRepository(BookingEntity).findBy({ organizerEmail: TEN_ORGANIZER });
    expect(stored).toHaveLength(1);
    expect(await keyRows(command.key)).toBe(1);
    const ids = outcomes.flatMap((outcome) => ('booking' in outcome ? [outcome.booking.id] : []));
    expect(new Set(ids)).toEqual(new Set([stored[0].id]));
  });

  it('answers in-progress at once while another transaction holds the key (IDM-006)', async () => {
    const command = commandFor(body());
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (holding = resolve));
    const holder = dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))', [command.key]);
      holding();
      await released;
    });
    await held;

    const startedAt = Date.now();
    const outcome = await idempotentBookings.create(command);
    const waited = Date.now() - startedAt;
    release();
    await holder;

    expect(outcome).toEqual({ kind: 'in-progress' });
    expect(waited).toBeLessThan(1000);
    expect(await keyRows(command.key)).toBe(0);
    await expect(idempotentBookings.create(command)).resolves.toMatchObject({ kind: 'created' });
  });

  it('stores key and booking together, then replays the stored body whatever happened since (IDM-002, IDM-003)', async () => {
    const command = commandFor(body({ startsAt: '2030-01-07T16:00:00+07:00' }));

    const first = await idempotentBookings.create(command);
    if (first.kind !== 'created') {
      throw new Error(`Expected a created booking, got ${first.kind}`);
    }
    expect(first.booking).toMatchObject({
      startsAt: '2030-01-07T09:00:00.000Z',
      endsAt: '2030-01-07T10:00:00.000Z',
      confirmationStatus: ConfirmationStatusEnum.PENDING,
      confirmationAttempts: 0,
    });
    expect(first.booking.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(await bookings.findById(first.booking.id)).toEqual(first.booking);
    expect(await keyRows(command.key)).toBe(1);
    const replay = { kind: 'replayed', booking: first.booking };

    await bookings.recordConfirmation({
      bookingId: first.booking.id,
      status: ConfirmationStatusEnum.SENT,
      attempts: 1,
    });
    await expect(idempotentBookings.create(command)).resolves.toEqual(replay);
    await expect(idempotentBookings.create({ ...command, key: command.key.toUpperCase() })).resolves.toEqual(replay);

    await bookings.deleteById(first.booking.id);
    await expect(idempotentBookings.create(command)).resolves.toEqual(replay);
    await expect(bookings.findById(first.booking.id)).resolves.toBeNull();
  });

  it('reports a key reused with another body and creates nothing (IDM-005)', async () => {
    const command = commandFor(body());
    await idempotentBookings.create(command);
    const before = await bookingRows(ORGANIZER);

    await expect(idempotentBookings.create(commandFor(body({ title: 'Retro' }), command.key))).resolves.toEqual({
      kind: 'reused',
    });
    expect(await bookingRows(ORGANIZER)).toBe(before);
    expect(await keyRows(command.key)).toBe(1);
  });

  it('rolls the key back when the booking is refused by CHK_bookings_span (IDM-002, BKG-011)', async () => {
    const command = commandFor(body({ organizerEmail: SPAN_ORGANIZER }));
    command.booking.endsAt = command.booking.startsAt;

    const error = await idempotentBookings.create(command).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toMatchObject({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION });
    expect(await keyRows(command.key)).toBe(0);
    expect(await bookingRows(SPAN_ORGANIZER)).toBe(0);
  });

  it('rolls the booking back when the key row cannot be written (IDM-002)', async () => {
    const command = commandFor(body({ organizerEmail: ROLLBACK_ORGANIZER }));
    command.fingerprint = 'f'.repeat(65);

    await expect(idempotentBookings.create(command)).rejects.toBeDefined();

    expect(await keyRows(command.key)).toBe(0);
    expect(await bookingRows(ROLLBACK_ORGANIZER)).toBe(0);
  });
});
