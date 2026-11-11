import { randomUUID } from 'node:crypto';
import { get, HttpResult, request } from './http';
import { nextSlot, Slot } from './slots';

export type Room = { id: string; name: string; capacity: number };

export type Booking = {
  id: string;
  roomId: string;
  title: string;
  organizerEmail: string;
  startsAt: string;
  endsAt: string;
  confirmationStatus: string;
  confirmationAttempts: number;
  createdAt: string;
  updatedAt: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; limit: number };

export type ErrorBody = { statusCode: number; errorCode: string; message: string };

export type BookingInput = {
  roomId: string;
  title: string;
  organizerEmail: string;
  startsAt: string;
  endsAt: string;
};

export const IDEMPOTENCY_KEY = 'Idempotency-Key';
export const IDEMPOTENCY_REPLAYED = 'Idempotency-Replayed';

export const rooms = async (): Promise<Room[]> => {
  const result = await get<Paged<Room>>('/rooms?page=1&limit=100');
  return result.body.items;
};

export const bookingInput = async (overrides: Partial<BookingInput> = {}, slot: Slot = nextSlot()): Promise<BookingInput> => {
  const [firstRoom] = await rooms();
  return {
    roomId: firstRoom.id,
    title: 'Acceptance booking',
    organizerEmail: 'organizer@example.com',
    ...slot,
    ...overrides,
  };
};

export const postBooking = <T = Booking>(input: unknown, key: string | null = randomUUID()): Promise<HttpResult<T>> =>
  request<T>('POST', '/bookings', { body: input, headers: key === null ? {} : { [IDEMPOTENCY_KEY]: key } });

export const createBooking = async (overrides: Partial<BookingInput> = {}, slot?: Slot): Promise<Booking> => {
  const result = await postBooking(await bookingInput(overrides, slot));
  if (result.status !== 201) {
    throw new Error(`Expected 201 from POST /bookings, got ${result.status}: ${JSON.stringify(result.body)}`);
  }
  return result.body;
};

export const getBooking = (id: string): Promise<HttpResult<Booking>> => get<Booking>(`/bookings/${id}`);

export const listRoomBookings = async (roomId: string): Promise<Booking[]> => {
  const all: Booking[] = [];
  for (let page = 1; ; page += 1) {
    const result = await get<Paged<Booking>>(`/bookings?roomId=${roomId}&page=${page}&limit=100`);
    all.push(...result.body.items);
    if (all.length >= result.body.total || result.body.items.length === 0) {
      return all;
    }
  }
};

export const sameInstant = (left: string, right: string): boolean => Date.parse(left) === Date.parse(right);
