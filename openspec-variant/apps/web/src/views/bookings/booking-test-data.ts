import { ConfirmationStatusEnum } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto, RoomDto } from '@roombook/contract';

export const pageOfBookings = (
  bookings: BookingDto[],
  page: number,
  limit: number,
  roomId?: string,
): PagedBookingsDto => {
  const matching = roomId ? bookings.filter((booking) => booking.roomId === roomId) : bookings;
  return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length, page, limit };
};

export const testRooms: RoomDto[] = Array.from({ length: 12 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { id: `00000000-0000-4000-8000-0000000000${number}`, name: `Room ${number}`, capacity: (index + 1) * 2 };
});

export const buildTestBooking = (number: number, roomId: string = testRooms[0].id): BookingDto => {
  const suffix = String(number).padStart(2, '0');
  return {
    id: `11111111-0000-4000-8000-0000000000${suffix}`,
    roomId,
    title: `Booking ${suffix}`,
    organizerEmail: `organizer${suffix}@example.com`,
    startsAt: `2030-01-${suffix}T09:30:00.000Z`,
    endsAt: `2030-01-${suffix}T10:30:00.000Z`,
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: '2029-12-01T00:00:00.000Z',
    updatedAt: '2029-12-01T00:00:00.000Z',
  };
};
