import { EntityManager } from 'typeorm';
import { isRoomSpanTaken, lockRoom } from './booking-overlap.query';

const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const OTHER_ROOM_ID = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';
const STARTS_AT = new Date('2030-01-07T09:00:00.000Z');
const ENDS_AT = new Date('2030-01-07T10:00:00.000Z');

describe('booking overlap queries', () => {
  let query: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([{ taken: false }]);
    manager = { query } as unknown as EntityManager;
  });

  describe('lockRoom', () => {
    it('takes one waiting transaction-scoped advisory lock named after the room', async () => {
      await expect(lockRoom(manager, ROOM_ID)).resolves.toBeUndefined();

      expect(query.mock.calls).toEqual([
        ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`room:${ROOM_ID}`]],
      ]);
    });

    it('uses a different lock name for a different room', async () => {
      await lockRoom(manager, ROOM_ID);
      await lockRoom(manager, OTHER_ROOM_ID);

      expect(query.mock.calls[0][1]).toEqual([`room:${ROOM_ID}`]);
      expect(query.mock.calls[1][1]).toEqual([`room:${OTHER_ROOM_ID}`]);
    });
  });

  describe('isRoomSpanTaken', () => {
    it('runs one half-open overlap check within the room, whatever the confirmation status', async () => {
      await isRoomSpanTaken(manager, ROOM_ID, STARTS_AT, ENDS_AT, BOOKING_ID);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, parameters] = query.mock.calls[0];
      expect(sql).toContain('"room_id" = $1');
      expect(sql).toContain('"starts_at" < $3');
      expect(sql).toContain('"ends_at" > $2');
      expect(sql).toContain('$4::uuid IS NULL OR "id" <> $4::uuid');
      expect(sql).not.toContain('confirmation_status');
      expect(parameters).toEqual([ROOM_ID, STARTS_AT, ENDS_AT, BOOKING_ID]);
    });

    it('passes null through when no booking is excluded', async () => {
      await isRoomSpanTaken(manager, ROOM_ID, STARTS_AT, ENDS_AT, null);

      expect(query.mock.calls[0][1]).toEqual([ROOM_ID, STARTS_AT, ENDS_AT, null]);
    });

    it.each([true, false])('returns %s as the database answers', async (taken) => {
      query.mockResolvedValue([{ taken }]);

      await expect(isRoomSpanTaken(manager, ROOM_ID, STARTS_AT, ENDS_AT, null)).resolves.toBe(taken);
    });
  });
});
