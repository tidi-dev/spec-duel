import { BookingEntity } from '@roombook/backend-common';
import { EntityManager, LessThan, MoreThan, Not } from 'typeorm';
import { BookingOverlapQuery } from './booking-overlap.query';
import { BookingOverlapCriteria } from './dto/booking-overlap-criteria';
import { BOOKING_ID, ROOM_ID } from './testing/booking.fixture';

describe('BookingOverlapQuery', () => {
  const criteria: BookingOverlapCriteria = {
    roomId: ROOM_ID,
    startsAt: new Date('2030-01-01T10:00:00.000Z'),
    endsAt: new Date('2030-01-01T11:00:00.000Z'),
  };
  let query: jest.Mock;
  let existsBy: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    existsBy = jest.fn().mockResolvedValue(false);
    manager = { query, existsBy } as unknown as EntityManager;
  });

  it('takes the blocking room lock with the prefixed room id before it checks', async () => {
    await BookingOverlapQuery.existsLocked(manager, criteria);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `booking-room:${ROOM_ID}`,
    ]);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(existsBy.mock.invocationCallOrder[0]);
  });

  it('looks for a booking of the room that starts before the end and ends after the start', async () => {
    await BookingOverlapQuery.existsLocked(manager, criteria);

    expect(existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: ROOM_ID,
      startsAt: LessThan(criteria.endsAt),
      endsAt: MoreThan(criteria.startsAt),
    });
    expect(existsBy.mock.calls[0][1]).not.toHaveProperty('id');
  });

  it('leaves the excluded booking out of the check', async () => {
    await BookingOverlapQuery.existsLocked(manager, { ...criteria, excludedBookingId: BOOKING_ID });

    expect(existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: ROOM_ID,
      startsAt: LessThan(criteria.endsAt),
      endsAt: MoreThan(criteria.startsAt),
      id: Not(BOOKING_ID),
    });
  });

  it.each([true, false])('answers %s when the check answers it', async (exists) => {
    existsBy.mockResolvedValue(exists);

    await expect(BookingOverlapQuery.existsLocked(manager, criteria)).resolves.toBe(exists);
  });
});
