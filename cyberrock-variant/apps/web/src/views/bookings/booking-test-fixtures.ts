import { ConfirmationStatusEnum } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto, PagedRoomsDto, RoomDto } from '@roombook/contract';

export const ATLAS_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';

export const atlas: RoomDto = { id: ATLAS_ID, name: 'Atlas', capacity: 8 };

export const twelveRooms: RoomDto[] = [
  atlas,
  ...Array.from({ length: 11 }, (_, index) => {
    const number = String(index + 2).padStart(2, '0');
    return { id: `00000000-0000-4000-8000-0000000000${number}`, name: `Room ${number}`, capacity: 4 };
  }),
];

export const bookingOf = (overrides: Partial<BookingDto> = {}): BookingDto => ({
  id: '7a1d2c3b-0000-4000-8000-000000000001',
  roomId: ATLAS_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

export const bookingsOf = (count: number): BookingDto[] =>
  Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return bookingOf({ id: `7a1d2c3b-0000-4000-8000-0000000000${number}`, title: `Booking ${number}` });
  });

export const pageOfBookings = (all: BookingDto[], page: number, limit: number): PagedBookingsDto => ({
  items: all.slice((page - 1) * limit, page * limit),
  total: all.length,
  page,
  limit,
});

export const pageOfRooms = (all: RoomDto[], page: number, limit: number): PagedRoomsDto => ({
  items: all.slice((page - 1) * limit, page * limit),
  total: all.length,
  page,
  limit,
});
