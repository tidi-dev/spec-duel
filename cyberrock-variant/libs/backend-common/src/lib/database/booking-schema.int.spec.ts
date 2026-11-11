import { DataSource } from 'typeorm';
import { BOOKINGS_SPAN_CONSTRAINT } from '../entities/booking.entity';
import { IDEMPOTENCY_KEYS_PRIMARY_KEY } from '../entities/idempotency-key.entity';

const describeWithDatabase = process.env['DB_HOST'] ? describe : describe.skip;

const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const KEY = '7a1e0c2d-5b7f-4e3a-9c1d-0f2e4a6b8c01';
const TITLE = 'booking-schema.int.spec';
const INSERT_BOOKING = `INSERT INTO "bookings" ("room_id", "title", "organizer_email", "starts_at", "ends_at")
  VALUES ($1, $2, 'ann@example.com', $3, $4)`;
const INSERT_KEY = `INSERT INTO "idempotency_keys" ("key", "fingerprint", "response_body") VALUES ($1, $2, '{}')`;

describeWithDatabase('bookings schema (real database)', () => {
  let dataSource: DataSource;

  const removeRows = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM "bookings" WHERE "title" = $1`, [TITLE]);
    await dataSource.query(`DELETE FROM "idempotency_keys" WHERE "key" = $1`, [KEY]);
  };

  beforeAll(async () => {
    ({ dataSource } = await import('./data-source'));
    await dataSource.initialize();
    await removeRows();
  });

  afterAll(async () => {
    await removeRows();
    await dataSource.destroy();
  });

  it('accepts a booking that ends after it starts', async () => {
    await expect(
      dataSource.query(INSERT_BOOKING, [ROOM_ID, TITLE, '2030-01-07T09:00:00Z', '2030-01-07T10:00:00Z']),
    ).resolves.toBeDefined();
  });

  it.each([
    ['equal to', '2030-01-07T09:00:00Z'],
    ['earlier than', '2030-01-07T08:59:59.999Z'],
  ])('refuses a booking whose ends_at is %s starts_at with CHK_bookings_span (BKG-011)', async (_case, endsAt) => {
    await expect(
      dataSource.query(INSERT_BOOKING, [ROOM_ID, TITLE, '2030-01-07T09:00:00Z', endsAt]),
    ).rejects.toMatchObject({ driverError: { code: '23514', constraint: BOOKINGS_SPAN_CONSTRAINT } });
    expect(BOOKINGS_SPAN_CONSTRAINT).toBe('CHK_bookings_span');
  });

  it('refuses a second row for one idempotency key, whatever its letter case', async () => {
    await dataSource.query(INSERT_KEY, [KEY, 'a'.repeat(64)]);

    await expect(dataSource.query(INSERT_KEY, [KEY.toUpperCase(), 'b'.repeat(64)])).rejects.toMatchObject({
      driverError: { code: '23505', constraint: IDEMPOTENCY_KEYS_PRIMARY_KEY },
    });
    const rows: unknown[] = await dataSource.query(`SELECT 1 FROM "idempotency_keys" WHERE "key" = $1`, [KEY]);
    expect(rows).toHaveLength(1);
  });
});
