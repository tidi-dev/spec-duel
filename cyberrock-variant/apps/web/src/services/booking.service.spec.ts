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

const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const BOOKING_ID = '7a1d2c3b-0000-4000-8000-000000000001';
const KEY = '11111111-1111-4111-8111-111111111111';

const body: CreateBookingDto = {
  roomId: ROOM_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const booking: BookingDto = {
  ...body,
  id: BOOKING_ID,
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

describe('booking service', () => {
  beforeEach(() => jest.resetAllMocks());

  it('listBookings requests GET /bookings with page, limit and roomId and returns the body', async () => {
    const paged: PagedBookingsDto = { items: [booking], total: 1, page: 2, limit: 10 };
    mockedGet.mockResolvedValue({ data: paged });

    const result = await listBookings({ page: 2, limit: 10, roomId: ROOM_ID });

    expect(mockedGet).toHaveBeenCalledWith('/bookings', { params: { page: 2, limit: 10, roomId: ROOM_ID } });
    expect(result).toEqual(paged);
  });

  it('listBookings sends no roomId parameter when none is given', async () => {
    mockedGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, limit: 10 } });

    await listBookings({ page: 1, limit: 10 });

    expect(mockedGet.mock.calls[0][1]).toStrictEqual({ params: { page: 1, limit: 10 } });
  });

  it('createBooking posts the body with the Idempotency-Key header and returns the booking', async () => {
    mockedPost.mockResolvedValue({ data: booking });

    const result = await createBooking(body, KEY);

    expect(mockedPost).toHaveBeenCalledWith('/bookings', body, { headers: { 'Idempotency-Key': KEY } });
    expect(result).toEqual(booking);
  });

  it('updateBooking patches /bookings/:id with only the given fields and returns the booking', async () => {
    mockedPatch.mockResolvedValue({ data: { ...booking, title: 'Retro' } });

    const result = await updateBooking(BOOKING_ID, { title: 'Retro' });

    expect(mockedPatch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`, { title: 'Retro' });
    expect(result.title).toBe('Retro');
  });

  it('deleteBooking requests DELETE /bookings/:id', async () => {
    mockedDelete.mockResolvedValue({ data: '' });

    await expect(deleteBooking(BOOKING_ID)).resolves.toBeUndefined();

    expect(mockedDelete).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`);
  });

  it('propagates a rejected request', async () => {
    const failure = new Error('boom');
    mockedPost.mockRejectedValue(failure);

    await expect(createBooking(body, KEY)).rejects.toBe(failure);
  });
});
