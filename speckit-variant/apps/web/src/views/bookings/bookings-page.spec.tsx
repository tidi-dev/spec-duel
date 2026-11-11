import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationStatusEnum, DEFAULT_PAGE_SIZE, ErrorCodeEnum, MAX_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking, deleteBooking, listBookings, updateBooking } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
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

const rooms: RoomDto[] = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'Room 02', capacity: 4 },
];

const bookingOf = (number: number, roomId: string, title: string): BookingDto => ({
  id: `b1b2c3d4-0000-4000-8000-00000000000${number}`,
  roomId,
  title,
  organizerEmail: 'ann@example.com',
  startsAt: `2030-01-0${number}T09:00:00.000Z`,
  endsAt: `2030-01-0${number}T10:00:00.000Z`,
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
});

let stored: BookingDto[];

const table = () => screen.getByRole('table', { name: 'Bookings' });
const form = () => screen.getByRole('form', { name: 'New booking' });
const roomFilter = () => {
  const filter = screen.getAllByRole('combobox', { name: 'Room' }).find((element) => !form().contains(element));
  if (!filter) throw new Error('Room filter not found');
  return filter;
};

const renderLoaded = async () => {
  render(<BookingsPage />);
  await screen.findByRole('table', { name: 'Bookings' });
  await within(roomFilter()).findByRole('option', { name: 'Room 02' });
  return userEvent.setup();
};

describe('BookingsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    stored = [bookingOf(1, rooms[0].id, 'Planning'), bookingOf(2, rooms[1].id, 'Retro')];
    mockedListRooms.mockResolvedValue({ items: rooms, total: rooms.length, page: 1, limit: MAX_PAGE_SIZE });
    mockedListBookings.mockImplementation(({ page, limit, roomId }) => {
      const items = stored.filter((booking) => !roomId || booking.roomId === roomId);
      return Promise.resolve({ items, total: items.length, page, limit });
    });
  });

  it('shows the heading, a labelled progress bar while loading, then the bookings with room names', async () => {
    render(<BookingsPage />);

    expect(screen.getByRole('heading', { name: 'Bookings', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loading bookings' })).toBeInTheDocument();
    expect(await within(await screen.findByRole('table', { name: 'Bookings' })).findByText('Room 02')).toBeVisible();
    expect(within(table()).getByText('Planning')).toBeInTheDocument();
    expect(within(table()).getByText('Retro')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(mockedListRooms).toHaveBeenCalledTimes(1);
    expect(mockedListRooms).toHaveBeenCalledWith(1, MAX_PAGE_SIZE);
    expect(mockedListBookings).toHaveBeenLastCalledWith({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('shows "No bookings found." instead of the table when the list is empty', async () => {
    stored = [];
    render(<BookingsPage />);

    expect(await screen.findByText('No bookings found.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Bookings' })).not.toBeInTheDocument();
  });

  it('shows an error alert with the message and no table when the load fails', async () => {
    mockedListBookings.mockRejectedValue(
      new ApiError({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'Booking service is down' }),
    );
    render(<BookingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking service is down');
    expect(screen.queryByRole('table', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByText('No bookings found.')).not.toBeInTheDocument();
  });

  it('shows the message when the rooms cannot be loaded', async () => {
    mockedListRooms.mockRejectedValue(new Error('Room service is down'));
    render(<BookingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Room service is down');
    expect(await screen.findByRole('table', { name: 'Bookings' })).toBeInTheDocument();
  });

  it('reloads the list for the room chosen in the filter and for all rooms again', async () => {
    const user = await renderLoaded();

    await user.selectOptions(roomFilter(), 'Room 02');

    await waitFor(() => expect(within(table()).queryByText('Planning')).not.toBeInTheDocument());
    expect(within(table()).getByText('Retro')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenLastCalledWith({ page: 1, limit: DEFAULT_PAGE_SIZE, roomId: rooms[1].id });

    await user.selectOptions(roomFilter(), 'All rooms');

    expect(await within(table()).findByText('Planning')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(3);
  });

  it('reloads the list and shows the new booking after a create', async () => {
    mockedCreateBooking.mockImplementation((booking) => {
      const created = { ...bookingOf(3, booking.roomId, booking.title), ...booking };
      stored = [...stored, created];
      return Promise.resolve(created);
    });
    const user = await renderLoaded();

    await user.selectOptions(within(form()).getByLabelText('Room'), 'Room 02');
    await user.type(within(form()).getByLabelText('Title'), 'Demo');
    await user.type(within(form()).getByLabelText('Organizer email'), 'cy@example.com');
    fireEvent.change(within(form()).getByLabelText('Start'), { target: { value: '2030-01-03T09:00' } });
    fireEvent.change(within(form()).getByLabelText('End'), { target: { value: '2030-01-03T10:00' } });
    await user.click(within(form()).getByRole('button', { name: 'Create booking' }));

    expect(await within(table()).findByText('Demo')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });

  it('reloads the list and shows the new title after an edit', async () => {
    mockedUpdateBooking.mockImplementation((id, changes) => {
      stored = stored.map((booking) => (booking.id === id ? { ...booking, ...changes } : booking));
      return Promise.resolve(stored[0]);
    });
    const user = await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Edit Planning' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit booking' });
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Kickoff');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(table()).findByText('Kickoff')).toBeInTheDocument();
    expect(within(table()).queryByText('Planning')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });

  it('deletes only after the dialog is confirmed, then reloads the list without the row', async () => {
    mockedDeleteBooking.mockImplementation((id) => {
      stored = stored.filter((booking) => booking.id !== id);
      return Promise.resolve();
    });
    const user = await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Delete Retro' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete booking' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedDeleteBooking).not.toHaveBeenCalled();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Delete Retro' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete booking' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(within(table()).queryByText('Retro')).not.toBeInTheDocument());
    expect(mockedDeleteBooking).toHaveBeenCalledWith('b1b2c3d4-0000-4000-8000-000000000002');
    expect(within(table()).getByText('Planning')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });
});
