import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking, deleteBooking, listBookings, updateBooking } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
import { buildTestBooking, pageOfBookings, testRooms } from './booking-test-data';
import { BookingsPage } from './bookings-page';

jest.mock('../../services/booking.service', () => ({
  listBookings: jest.fn(),
  createBooking: jest.fn(),
  updateBooking: jest.fn(),
  deleteBooking: jest.fn(),
}));
jest.mock('../../services/room.service', () => ({ listRooms: jest.fn() }));

const mockedListBookings = listBookings as jest.MockedFunction<typeof listBookings>;
const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;
const mockedUpdateBooking = updateBooking as jest.MockedFunction<typeof updateBooking>;
const mockedDeleteBooking = deleteBooking as jest.MockedFunction<typeof deleteBooking>;
const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

let storedBookings: BookingDto[];

const renderLoadedPage = async () => {
  const user = userEvent.setup();
  render(<BookingsPage />);
  await screen.findByText('Booking 01');
  return user;
};

describe('BookingsPage actions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    storedBookings = Array.from({ length: 11 }, (_, index) => buildTestBooking(index + 1));
    mockedListRooms.mockResolvedValue({ items: testRooms, total: testRooms.length, page: 1, limit: 100 });
    mockedListBookings.mockImplementation((page, limit, roomId) =>
      Promise.resolve(pageOfBookings(storedBookings, page, limit, roomId)),
    );
    mockedDeleteBooking.mockImplementation((id) => {
      storedBookings = storedBookings.filter((booking) => booking.id !== id);
      return Promise.resolve();
    });
  });

  it('reloads the table after a booking is created', async () => {
    mockedCreateBooking.mockResolvedValue(buildTestBooking(12));
    const user = await renderLoadedPage();

    await user.selectOptions(screen.getByLabelText('Room'), 'Room 03');
    await user.type(screen.getByLabelText('Title'), 'Planning');
    await user.type(screen.getByLabelText('Organizer email'), 'ann@example.com');
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2030-01-01T09:30' } });
    fireEvent.change(screen.getByLabelText('End (UTC)'), { target: { value: '2030-01-01T10:30' } });
    await user.click(screen.getByRole('button', { name: 'Create booking' }));

    await waitFor(() => expect(mockedListBookings).toHaveBeenCalledTimes(2));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockedCreateBooking.mock.calls[0][0].roomId).toBe(testRooms[2].id);
    expect(mockedListBookings).toHaveBeenLastCalledWith(1, 10, undefined);
  });

  it('closes the edit dialog and reloads the table after a booking is saved', async () => {
    mockedUpdateBooking.mockImplementation((id, changes) => {
      storedBookings = storedBookings.map((booking) => (booking.id === id ? { ...booking, ...changes } : booking));
      return Promise.resolve(storedBookings[0]);
    });
    const user = await renderLoadedPage();

    await user.click(screen.getByRole('button', { name: 'Edit Booking 01' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit booking' }));
    expect(dialog.getByLabelText('Title')).toHaveValue('Booking 01');
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(mockedUpdateBooking).toHaveBeenCalledWith(storedBookings[0].id, {
      title: 'Retro',
      startsAt: '2030-01-01T09:30:00.000Z',
      endsAt: '2030-01-01T10:30:00.000Z',
    });
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends nothing when the edit dialog is cancelled', async () => {
    const user = await renderLoadedPage();

    await user.click(screen.getByRole('button', { name: 'Edit Booking 01' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);
  });

  it('deletes the booking and reloads the table after the delete is confirmed', async () => {
    const deletedId = storedBookings[0].id;
    const user = await renderLoadedPage();

    await user.click(screen.getByRole('button', { name: 'Delete Booking 01' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Booking 01')).not.toBeInTheDocument());
    expect(mockedDeleteBooking).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBooking).toHaveBeenCalledWith(deletedId);
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Booking 11')).toBeInTheDocument();
  });

  it('sends nothing and keeps the row when the delete is declined', async () => {
    const user = await renderLoadedPage();

    await user.click(screen.getByRole('button', { name: 'Delete Booking 01' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedDeleteBooking).not.toHaveBeenCalled();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Booking 01')).toBeInTheDocument();
  });

  it('shows the API message and keeps the table when the delete fails', async () => {
    mockedDeleteBooking.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND,
        message: 'Booking 123 was not found',
      }),
    );
    const user = await renderLoadedPage();

    await user.click(screen.getByRole('button', { name: 'Delete Booking 01' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking 123 was not found');
    expect(screen.getByRole('table', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByText('Booking 01')).toBeInTheDocument();
  });

  it('goes back one page after deleting the only booking of the last page', async () => {
    const user = await renderLoadedPage();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    await screen.findByText('Booking 11');

    await user.click(screen.getByRole('button', { name: 'Delete Booking 11' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedListBookings).toHaveBeenLastCalledWith(1, 10, undefined));
    expect(await screen.findByText('Booking 10')).toBeInTheDocument();
  });
});
