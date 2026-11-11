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

const ROOM_ID = '00000000-0000-4000-8000-000000000001';
const BOOKING_ID = '11111111-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '22222222-0000-4000-8000-000000000001';

const booking: BookingDto = {
  id: BOOKING_ID,
  roomId: ROOM_ID,
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-01T09:30:00.000Z',
  endsAt: '2030-01-01T10:30:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T00:00:00.000Z',
  updatedAt: '2029-12-01T00:00:00.000Z',
};

describe('booking.service', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('listBookings', () => {
    const body: PagedBookingsDto = { items: [booking], total: 1, page: 2, limit: 5 };

    it('requests GET /bookings with page and limit only when no room is given', async () => {
      mockedGet.mockResolvedValue({ data: body });

      const result = await listBookings(2, 5);

      expect(mockedGet).toHaveBeenCalledWith('/bookings', { params: { page: 2, limit: 5 } });
      expect(mockedGet.mock.calls[0][1].params).not.toHaveProperty('roomId');
      expect(result).toEqual(body);
    });

    it('adds roomId to the query when a room is given', async () => {
      mockedGet.mockResolvedValue({ data: body });

      await listBookings(1, 10, ROOM_ID);

      expect(mockedGet).toHaveBeenCalledWith('/bookings', { params: { page: 1, limit: 10, roomId: ROOM_ID } });
    });
  });

  describe('createBooking', () => {
    it('requests POST /bookings with the body and the Idempotency-Key header', async () => {
      const payload: CreateBookingDto = {
        roomId: ROOM_ID,
        title: 'Planning',
        organizerEmail: 'ann@example.com',
        startsAt: '2030-01-01T09:30:00.000Z',
        endsAt: '2030-01-01T10:30:00.000Z',
      };
      mockedPost.mockResolvedValue({ data: booking });

      const result = await createBooking(payload, IDEMPOTENCY_KEY);

      expect(mockedPost).toHaveBeenCalledWith('/bookings', payload, {
        headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      });
      expect(result).toEqual(booking);
    });
  });

  describe('updateBooking', () => {
    it('requests PATCH /bookings/:id with the changes', async () => {
      const changes = { title: 'Retro' };
      mockedPatch.mockResolvedValue({ data: { ...booking, title: 'Retro' } });

      const result = await updateBooking(BOOKING_ID, changes);

      expect(mockedPatch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`, changes);
      expect(result.title).toBe('Retro');
    });
  });

  describe('deleteBooking', () => {
    it('requests DELETE /bookings/:id', async () => {
      mockedDelete.mockResolvedValue({ data: '' });

      await expect(deleteBooking(BOOKING_ID)).resolves.toBeUndefined();

      expect(mockedDelete).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`);
    });
  });

  it('propagates a rejected request', async () => {
    const failure = new Error('boom');
    mockedGet.mockRejectedValue(failure);

    await expect(listBookings(1, 10)).rejects.toBe(failure);
  });
});
