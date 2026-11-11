import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { deleteBooking, listBookings } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
import { ATLAS_ID, bookingOf, bookingsOf, pageOfBookings, pageOfRooms, twelveRooms } from './booking-test-fixtures';
import { BookingsPage } from './bookings-page';

jest.mock('../../services/booking.service', () => ({
  listBookings: jest.fn(),
  createBooking: jest.fn(),
  updateBooking: jest.fn(),
  deleteBooking: jest.fn(),
}));
jest.mock('../../services/room.service', () => ({ listRooms: jest.fn() }));

const mockedListBookings = listBookings as jest.MockedFunction<typeof listBookings>;
const mockedDeleteBooking = deleteBooking as jest.MockedFunction<typeof deleteBooking>;
const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

let stored: BookingDto[];

const table = () => screen.getByRole('table', { name: 'Bookings' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const lastQuery = () => mockedListBookings.mock.calls[mockedListBookings.mock.calls.length - 1][0];
const goToPage2 = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /next page/i }));
  await waitFor(() => expect(lastQuery()).toStrictEqual({ page: 2, limit: 10 }));
};

describe('BookingsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    stored = [bookingOf()];
    mockedListRooms.mockImplementation((page, limit) => Promise.resolve(pageOfRooms(twelveRooms, page, limit)));
    mockedListBookings.mockImplementation(({ page, limit }) => Promise.resolve(pageOfBookings(stored, page, limit)));
    mockedDeleteBooking.mockImplementation((id) => {
      stored = stored.filter((booking) => booking.id !== id);
      return Promise.resolve();
    });
  });

  it('shows a progress bar, then the row of B1 with the room name and UTC times (BPG-002, BPG-004)', async () => {
    render(<BookingsPage />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('Sprint planning')).toBeInTheDocument();
    expect(mockedListBookings.mock.calls[0][0]).toStrictEqual({ page: 1, limit: 10 });
    const row = within(bodyRows()[0]);
    expect(await row.findByText('Atlas')).toBeInTheDocument();
    expect(row.getByText('ann@example.com')).toBeInTheDocument();
    expect(row.getByText('2030-01-07 09:00 UTC')).toBeInTheDocument();
    expect(row.getByText('2030-01-07 10:00 UTC')).toBeInTheDocument();
    expect(row.getByText('PENDING')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('requests page 2 with limit 10 when "next page" is clicked on 12 bookings (BPG-002)', async () => {
    stored = bookingsOf(12);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 10');
    expect(bodyRows()).toHaveLength(10);

    await goToPage2(user);

    expect(await screen.findByText('Booking 12')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
  });

  it('offers "All rooms" and all 12 rooms in the filter (BPG-003, R-16)', async () => {
    render(<BookingsPage />);
    const filter = screen.getByLabelText('Filter by room');

    await waitFor(() => expect(within(filter).getAllByRole('option')).toHaveLength(13));
    const options = within(filter).getAllByRole('option');
    expect(options[0]).toHaveTextContent('All rooms');
    expect(options.slice(1).map((option) => option.textContent)).toEqual(twelveRooms.map((room) => room.name));
  });

  it('requests page 1 with the room id when a room is chosen on page 2, and no room id for "All rooms" (BPG-003)', async () => {
    stored = bookingsOf(12);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 10');
    await goToPage2(user);
    const filter = screen.getByLabelText('Filter by room');
    await within(filter).findByRole('option', { name: 'Atlas' });

    await user.selectOptions(filter, 'Atlas');
    await waitFor(() => expect(lastQuery()).toStrictEqual({ page: 1, limit: 10, roomId: ATLAS_ID }));

    await user.selectOptions(filter, 'All rooms');
    await waitFor(() => expect(lastQuery()).toStrictEqual({ page: 1, limit: 10 }));
  });

  it('shows the API message in an alert and no table when the list request fails (BPG-004)', async () => {
    mockedListBookings.mockRejectedValue(
      new ApiError({
        statusCode: 503,
        errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE,
        message: 'Booking service is unavailable',
      }),
    );
    render(<BookingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking service is unavailable');
    expect(screen.queryByRole('table', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows "No bookings yet" for an empty result (BPG-004)', async () => {
    stored = [];
    render(<BookingsPage />);

    expect(await screen.findByText('No bookings yet')).toBeInTheDocument();
  });

  it('ignores the answer of an earlier request that arrives after a newer one', async () => {
    const answers: ((value: PagedBookingsDto) => void)[] = [];
    mockedListBookings.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const user = userEvent.setup();
    render(<BookingsPage />);
    const filter = screen.getByLabelText('Filter by room');
    await within(filter).findByRole('option', { name: 'Atlas' });

    await user.selectOptions(filter, 'Atlas');
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1](pageOfBookings([bookingOf({ title: 'Atlas only' })], 1, 10));
    await screen.findByText('Atlas only');
    answers[0](pageOfBookings([bookingOf({ title: 'Unfiltered and late' })], 1, 10));

    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByText('Atlas only')).toBeInTheDocument();
    expect(screen.queryByText('Unfiltered and late')).not.toBeInTheDocument();
  });

  it('requests and shows page 1 after the only row of page 2 is deleted (BPG-008, R-15)', async () => {
    stored = bookingsOf(11);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 10');
    await goToPage2(user);
    await screen.findByText('Booking 11');
    expect(bodyRows()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Delete Booking 11' }));

    await waitFor(() => expect(lastQuery()).toStrictEqual({ page: 1, limit: 10 }));
    expect(mockedDeleteBooking).toHaveBeenCalledWith('7a1d2c3b-0000-4000-8000-000000000011');
    expect(await screen.findByText('Booking 10')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(10);
    expect(screen.queryByText('Booking 11')).not.toBeInTheDocument();
    expect(screen.queryByText('No bookings yet')).not.toBeInTheDocument();
    expect(screen.getByText('1–10 of 10')).toBeInTheDocument();
  });

  it('stays on the page when a deleted row leaves other rows on it (BPG-008)', async () => {
    stored = bookingsOf(2);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 02');

    await user.click(screen.getByRole('button', { name: 'Delete Booking 02' }));

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Booking 01')).toBeInTheDocument();
  });

  it('shows the API message and fetches the list again when the delete fails with 404 (BPG-008)', async () => {
    mockedDeleteBooking.mockRejectedValue(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'Booking b1 was not found' }),
    );
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Sprint planning');

    await user.click(screen.getByRole('button', { name: 'Delete Sprint planning' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking b1 was not found');
    await waitFor(() => expect(mockedListBookings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Booking b1 was not found');
    expect(table()).toBeInTheDocument();
  });
});
