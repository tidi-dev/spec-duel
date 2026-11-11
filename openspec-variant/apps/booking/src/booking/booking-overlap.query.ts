import { BookingEntity } from '@roombook/backend-common';
import { EntityManager, LessThan, MoreThan, Not } from 'typeorm';
import { BookingOverlapCriteria } from './dto/booking-overlap-criteria';

const ROOM_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';
const ROOM_LOCK_PREFIX = 'booking-room:';

export class BookingOverlapQuery {
  static async existsLocked(manager: EntityManager, criteria: BookingOverlapCriteria): Promise<boolean> {
    await manager.query(ROOM_LOCK_SQL, [`${ROOM_LOCK_PREFIX}${criteria.roomId}`]);
    return manager.existsBy(BookingEntity, {
      roomId: criteria.roomId,
      startsAt: LessThan(criteria.endsAt),
      endsAt: MoreThan(criteria.startsAt),
      ...(criteria.excludedBookingId ? { id: Not(criteria.excludedBookingId) } : {}),
    });
  }
}
