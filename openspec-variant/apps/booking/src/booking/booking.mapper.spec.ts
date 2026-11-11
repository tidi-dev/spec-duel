import { ConfirmationStatusEnum } from '@roombook/contract';
import { BookingMapper } from './booking.mapper';
import { BOOKING_ID, bookingEntity, ROOM_ID } from './testing/booking.fixture';

describe('BookingMapper.toDto', () => {
  it('maps exactly the booking fields, with every time as an ISO 8601 UTC string', () => {
    const entity = bookingEntity({ confirmationStatus: ConfirmationStatusEnum.SENT, confirmationAttempts: 3 });

    expect(BookingMapper.toDto(entity)).toStrictEqual({
      id: BOOKING_ID,
      roomId: ROOM_ID,
      title: 'Planning',
      organizerEmail: 'ana@example.com',
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      confirmationStatus: 'SENT',
      confirmationAttempts: 3,
      createdAt: '2029-12-01T09:00:00.000Z',
      updatedAt: '2029-12-02T09:00:00.000Z',
    });
  });
});
