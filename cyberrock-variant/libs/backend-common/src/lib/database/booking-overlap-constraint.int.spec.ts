import { DataSource } from 'typeorm';
import { BOOKINGS_ROOM_SPAN_CONSTRAINT } from '../entities/booking.entity';

const describeWithDatabase = process.env['DB_HOST'] ? describe : describe.skip;

const R1 = '5b1d2e63-9a1c-4d6a-8b7f-2e3c8d0f5b21';
const R2 = '6c2e3f74-0b2d-4e7b-9c80-3f4d9e106c32';
const TITLE = 'booking-overlap-constraint.int.spec';
const INSERT_BOOKING = `INSERT INTO "bookings" ("room_id", "title", "organizer_email", "starts_at", "ends_at")
  VALUES ($1, $2, 'ann@example.com', $3, $4)`;

describeWithDatabase('bookings overlap exclusion (real database)', () => {
  let dataSource: DataSource;

  const insert = (roomId: string, startsAt: string, endsAt: string): Promise<unknown> =>
    dataSource.query(INSERT_BOOKING, [roomId, TITLE, `2030-01-07T${startsAt}Z`, `2030-01-07T${endsAt}Z`]);
  const removeRows = (): Promise<unknown> => dataSource.query(`DELETE FROM "bookings" WHERE "title" = $1`, [TITLE]);

  beforeAll(async () => {
    ({ dataSource } = await import('./data-source'));
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await removeRows();
    await insert(R1, '09:00:00', '10:00:00');
  });

  afterAll(async () => {
    await removeRows();
    await dataSource.destroy();
  });

  it('names the constraint EXCL_bookings_room_span (BKG-016)', () => {
    expect(BOOKINGS_ROOM_SPAN_CONSTRAINT).toBe('EXCL_bookings_room_span');
  });

  it.each([
    ['09:30:00', '10:30:00'],
    ['08:00:00', '09:00:00.001'],
    ['09:15:00', '09:45:00'],
    ['08:00:00', '11:00:00'],
  ])('refuses a directly inserted row of the same room spanning %s to %s (BKG-016, R-08)', async (startsAt, endsAt) => {
    await expect(insert(R1, startsAt, endsAt)).rejects.toMatchObject({
      driverError: { code: '23P01', constraint: 'EXCL_bookings_room_span' },
    });
    const rows: unknown[] = await dataSource.query(`SELECT 1 FROM "bookings" WHERE "title" = $1`, [TITLE]);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['a touching row after', R1, '10:00:00', '11:00:00'],
    ['a touching row before', R1, '08:00:00', '09:00:00'],
    ['the same span in another room', R2, '09:00:00', '10:00:00'],
  ])('stores %s (BKG-016, BKG-012)', async (_case, roomId, startsAt, endsAt) => {
    await expect(insert(roomId, startsAt, endsAt)).resolves.toBeDefined();
  });
});
