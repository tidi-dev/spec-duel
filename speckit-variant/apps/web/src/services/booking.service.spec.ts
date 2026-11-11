import { ConfirmationStatusEnum } from '@roombook/contract';
import type { BookingDto, CreateBookingDto, PagedBookingsDto } from '@roombook/contract';
import { apiClient } from './api-client';
import { createBooking, deleteBooking, listBookings, updateBooking } from './booking.service';

jest.mock('./api-client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;
const mockedPatch = apiClient.patch as jest.Mock;
const mockedDelete = apiClient.delete as jest.Mock;

const ROOM_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const BOOKING_ID = 'b1b2c3d4-0000-4000-8000-000000000001';

const booking: BookingDto = {
  id: BOOKING_ID,
  roomId: ROOM_ID,
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

describe('booking.service', () => {
  beforeEach(() => jest.resetAllMocks());

  it('listBookings requests GET /bookings with page and limit only when no room is set', async () => {
    const body: PagedBookingsDto = { items: [booking], total: 1, page: 2, limit: 10 };
    mockedGet.mockResolvedValue({ data: body });

    const result = await listBookings({ page: 2, limit: 10 });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0]).toStrictEqual(['/bookings', { params: { page: 2, limit: 10 } }]);
    expect(result).toEqual(body);
  });

  it('listBookings adds roomId when it is set', async () => {
    mockedGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, limit: 10 } });

    await listBookings({ page: 1, limit: 10, roomId: ROOM_ID });

    expect(mockedGet.mock.calls[0]).toStrictEqual(['/bookings', { params: { page: 1, limit: 10, roomId: ROOM_ID } }]);
  });

  it('createBooking posts the body to /bookings with the Idempotency-Key header', async () => {
    const body: CreateBookingDto = {
      roomId: ROOM_ID,
      title: 'Planning',
      organizerEmail: 'ann@example.com',
      startsAt: '2030-01-07T09:00:00.000Z',
      endsAt: '2030-01-07T10:00:00.000Z',
    };
    const key = 'c1b2c3d4-0000-4000-8000-000000000001';
    mockedPost.mockResolvedValue({ data: booking });

    const result = await createBooking(body, key);

    expect(mockedPost).toHaveBeenCalledWith('/bookings', body, { headers: { 'Idempotency-Key': key } });
    expect(result).toEqual(booking);
  });

  it('updateBooking patches /bookings/:id with the changes', async () => {
    const changes = { title: 'Retro' };
    mockedPatch.mockResolvedValue({ data: { ...booking, title: 'Retro' } });

    const result = await updateBooking(BOOKING_ID, changes);

    expect(mockedPatch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`, changes);
    expect(result.title).toBe('Retro');
  });

  it('deleteBooking deletes /bookings/:id and resolves with nothing', async () => {
    mockedDelete.mockResolvedValue({ data: '' });

    await expect(deleteBooking(BOOKING_ID)).resolves.toBeUndefined();

    expect(mockedDelete).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`);
  });

  it('propagates a rejected request', async () => {
    const failure = new Error('boom');
    mockedGet.mockRejectedValue(failure);

    await expect(listBookings({ page: 1, limit: 10 })).rejects.toBe(failure);
  });
});
