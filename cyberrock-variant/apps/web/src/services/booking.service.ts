import { ApiRouteEnum, IDEMPOTENCY_KEY_HEADER } from '@roombook/contract';
import type {
  BookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  PagedBookingsDto,
  UpdateBookingDto,
} from '@roombook/contract';
import { apiClient } from './api-client';

const BOOKINGS_PATH = `/${ApiRouteEnum.BOOKINGS}`;

export const listBookings = async (query: ListBookingsQueryDto): Promise<PagedBookingsDto> => {
  const { data } = await apiClient.get<PagedBookingsDto>(BOOKINGS_PATH, { params: query });
  return data;
};

export const createBooking = async (body: CreateBookingDto, idempotencyKey: string): Promise<BookingDto> => {
  const { data } = await apiClient.post<BookingDto>(BOOKINGS_PATH, body, {
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
  return data;
};

export const updateBooking = async (id: string, body: UpdateBookingDto): Promise<BookingDto> => {
  const { data } = await apiClient.patch<BookingDto>(`${BOOKINGS_PATH}/${id}`, body);
  return data;
};

export const deleteBooking = async (id: string): Promise<void> => {
  await apiClient.delete(`${BOOKINGS_PATH}/${id}`);
};
