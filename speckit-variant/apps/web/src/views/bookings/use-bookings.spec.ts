import { act, renderHook, waitFor } from '@testing-library/react';
import { ConfirmationStatusEnum, DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto } from '@roombook/contract';
import { listBookings } from '../../services/booking.service';
import { useBookings } from './use-bookings';

jest.mock('../../services/booking.service', () => ({ listBookings: jest.fn() }));

const mockedListBookings = listBookings as jest.MockedFunction<typeof listBookings>;

const ROOM_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const booking: BookingDto = {
  id: 'b1b2c3d4-0000-4000-8000-000000000001',
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

const paged = (page: number): PagedBookingsDto => ({ items: [booking], total: 25, page, limit: DEFAULT_PAGE_SIZE });

const lastQuery = () => mockedListBookings.mock.calls[mockedListBookings.mock.calls.length - 1][0];

const renderLoaded = async () => {
  const rendered = renderHook(() => useBookings());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
};

describe('useBookings', () => {
  beforeEach(() => {
    mockedListBookings.mockReset();
    mockedListBookings.mockImplementation((query) => Promise.resolve(paged(query.page)));
  });

  it('loads page 1 with the default page size on mount and is loading until the answer', async () => {
    const { result } = renderHook(() => useBookings());

    expect(result.current.loading).toBe(true);
    expect(result.current.bookings).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedListBookings).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toMatchObject({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(lastQuery().roomId).toBeUndefined();
    expect(result.current.bookings).toEqual([booking]);
    expect(result.current.total).toBe(25);
    expect(result.current.page).toBe(1);
    expect(result.current.errorMessage).toBeNull();
  });

  it('setPage reloads that page', async () => {
    const { result } = await renderLoaded();

    act(() => result.current.setPage(3));

    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 3, limit: DEFAULT_PAGE_SIZE }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBe(3);
  });

  it('setRoomId reloads with that room from page 1, and clearing it removes the filter', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPage(2));
    await waitFor(() => expect(lastQuery().page).toBe(2));

    act(() => result.current.setRoomId(ROOM_ID));

    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1, limit: DEFAULT_PAGE_SIZE, roomId: ROOM_ID }));
    expect(result.current.roomId).toBe(ROOM_ID);
    expect(result.current.page).toBe(1);

    act(() => result.current.setRoomId(undefined));

    await waitFor(() => expect(lastQuery().roomId).toBeUndefined());
    expect(lastQuery().page).toBe(1);
    expect(result.current.roomId).toBeUndefined();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('reload fetches the same page and room again', async () => {
    const { result } = await renderLoaded();

    act(() => result.current.reload());

    await waitFor(() => expect(mockedListBookings).toHaveBeenCalledTimes(2));
    expect(lastQuery()).toMatchObject({ page: 1, limit: DEFAULT_PAGE_SIZE });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes the message of a rejection and no bookings', async () => {
    const { result } = await renderLoaded();
    mockedListBookings.mockRejectedValue(new Error('Booking service is unavailable'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.errorMessage).toBe('Booking service is unavailable'));
    expect(result.current.bookings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
