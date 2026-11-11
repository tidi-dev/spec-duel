import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { listBookings } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
import { buildTestBooking, pageOfBookings, testRooms } from './booking-test-data';
import { BookingsPage } from './bookings-page';

jest.mock('../../services/booking.service', () => ({ listBookings: jest.fn() }));
jest.mock('../../services/room.service', () => ({ listRooms: jest.fn() }));

const mockedListBookings = listBookings as jest.MockedFunction<typeof listBookings>;
const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

const ROOM_03_ID = testRooms[2].id;
const seededBookings = Array.from({ length: 12 }, (_, index) =>
  buildTestBooking(index + 1, index < 2 ? ROOM_03_ID : testRooms[0].id),
);

const bodyRows = () => within(screen.getByRole('table', { name: 'Bookings' })).getAllByRole('row').slice(1);

describe('BookingsPage', () => {
  beforeEach(() => {
    mockedListBookings.mockReset();
    mockedListRooms.mockReset();
    mockedListRooms.mockResolvedValue({ items: testRooms, total: testRooms.length, page: 1, limit: 100 });
    mockedListBookings.mockImplementation((page, limit, roomId) =>
      Promise.resolve(pageOfBookings(seededBookings, page, limit, roomId)),
    );
  });

  it('shows a loading indicator, then the heading, the filter, the create form and the rows of page 1', async () => {
    render(<BookingsPage />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('Booking 10')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by room')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create booking' })).toBeInTheDocument();
    expect(mockedListRooms).toHaveBeenCalledWith(1, 100);
    expect(mockedListBookings).toHaveBeenCalledWith(1, 10, undefined);
    expect(bodyRows()).toHaveLength(10);
    expect(within(bodyRows()[0]).getByText('Room 03')).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByText('2030-01-01 09:30')).toBeInTheDocument();
  });

  it('fills the filter with "All rooms" and the room names', async () => {
    render(<BookingsPage />);
    await screen.findByText('Booking 10');

    const options = within(screen.getByLabelText('Filter by room')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['All rooms', ...testRooms.map((room) => room.name)]);
  });

  it('shows the empty message when the API answers no bookings', async () => {
    mockedListBookings.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    render(<BookingsPage />);

    expect(await screen.findByText('No bookings found.')).toBeInTheDocument();
  });

  it('shows the API message and no table when loading the bookings fails', async () => {
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

  it('shows the API message and no table when loading the rooms fails', async () => {
    mockedListRooms.mockRejectedValue(
      new ApiError({
        statusCode: 503,
        errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE,
        message: 'Room service is unavailable',
      }),
    );
    render(<BookingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Room service is unavailable');
    expect(screen.queryByRole('table', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('requests page 2 and shows its rows after going to the next page', async () => {
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 10');

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(mockedListBookings).toHaveBeenLastCalledWith(2, 10, undefined));
    expect(await screen.findByText('Booking 11')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
  });

  it('requests page 1 of the chosen room, and drops the filter again for "All rooms"', async () => {
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Booking 10');
    await user.click(screen.getByRole('button', { name: /next page/i }));
    await screen.findByText('Booking 11');

    await user.selectOptions(screen.getByLabelText('Filter by room'), 'Room 03');

    await waitFor(() => expect(mockedListBookings).toHaveBeenLastCalledWith(1, 10, ROOM_03_ID));
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByText('Booking 01')).toBeInTheDocument();
    expect(screen.getByText('Booking 02')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by room'), 'All rooms');

    await waitFor(() => expect(mockedListBookings).toHaveBeenLastCalledWith(1, 10, undefined));
    await waitFor(() => expect(bodyRows()).toHaveLength(10));
  });
});
