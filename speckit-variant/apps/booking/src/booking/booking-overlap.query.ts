import { EntityManager } from 'typeorm';

type RoomSpanTakenRow = { taken: boolean };

const LOCK_ROOM_SQL = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';

const ROOM_SPAN_TAKEN_SQL = `SELECT EXISTS (
  SELECT 1 FROM "bookings"
  WHERE "room_id" = $1
    AND "starts_at" < $3
    AND "ends_at" > $2
    AND ($4::uuid IS NULL OR "id" <> $4::uuid)
) AS "taken"`;

export const lockRoom = async (manager: EntityManager, roomId: string): Promise<void> => {
  await manager.query(LOCK_ROOM_SQL, [`room:${roomId}`]);
};

export const isRoomSpanTaken = async (
  manager: EntityManager,
  roomId: string,
  startsAt: Date,
  endsAt: Date,
  excludedBookingId: string | null,
): Promise<boolean> => {
  const [row]: RoomSpanTakenRow[] = await manager.query(ROOM_SPAN_TAKEN_SQL, [
    roomId,
    startsAt,
    endsAt,
    excludedBookingId,
  ]);
  return row.taken;
};
