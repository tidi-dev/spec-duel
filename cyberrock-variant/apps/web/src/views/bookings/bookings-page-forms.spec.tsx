import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookingDto } from '@roombook/contract';
import { createBooking, listBookings, updateBooking } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
import { ATLAS_ID, bookingOf, pageOfBookings, pageOfRooms, twelveRooms } from './booking-test-fixtures';
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
const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

const RETRO_ID = '7a1d2c3b-0000-4000-8000-000000000002';

let stored: BookingDto[];

describe('BookingsPage forms', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    stored = [bookingOf({ startsAt: '2030-01-07T09:00:30.123Z' })];
    mockedListRooms.mockImplementation((page, limit) => Promise.resolve(pageOfRooms(twelveRooms, page, limit)));
    mockedListBookings.mockImplementation(({ page, limit }) => Promise.resolve(pageOfBookings(stored, page, limit)));
  });

  it('offers every room in the form select and fetches the list again after a create (BPG-003, BPG-005)', async () => {
    mockedCreateBooking.mockImplementation((body) => {
      const created = bookingOf({ ...body, id: RETRO_ID });
      stored = [...stored, created];
      return Promise.resolve(created);
    });
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Sprint planning');
    const form = within(screen.getByRole('form', { name: 'New booking' }));
    await waitFor(() => expect(within(form.getByLabelText('Room')).getAllByRole('option')).toHaveLength(13));

    await user.selectOptions(form.getByLabelText('Room'), 'Atlas');
    await user.type(form.getByLabelText('Title'), 'Retro');
    await user.type(form.getByLabelText('Organizer email'), 'bob@example.com');
    fireEvent.change(form.getByLabelText('Start (UTC)'), { target: { value: '2030-01-08T09:00' } });
    fireEvent.change(form.getByLabelText('End (UTC)'), { target: { value: '2030-01-08T10:00' } });
    await user.click(form.getByRole('button', { name: 'Create booking' }));

    expect(await within(screen.getByRole('table', { name: 'Bookings' })).findByText('Retro')).toBeInTheDocument();
    expect(mockedCreateBooking.mock.calls[0][0]).toStrictEqual({
      roomId: ATLAS_ID,
      title: 'Retro',
      organizerEmail: 'bob@example.com',
      startsAt: '2030-01-08T09:00:00.000Z',
      endsAt: '2030-01-08T10:00:00.000Z',
    });
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });

  it('opens the edit dialog for a row, saves only the title and fetches the list again (BPG-007)', async () => {
    mockedUpdateBooking.mockImplementation((id, changes) => {
      stored = stored.map((booking) => (booking.id === id ? { ...booking, ...changes } : booking));
      return Promise.resolve(stored[0]);
    });
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Sprint planning');

    await user.click(screen.getByRole('button', { name: 'Edit Sprint planning' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit booking' }));
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedUpdateBooking.mock.calls[0]).toStrictEqual([stored[0].id, { title: 'Retro' }]);
    expect(await within(screen.getByRole('table', { name: 'Bookings' })).findByText('Retro')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });

  it('closes the dialog without a request or a refetch when it is saved untouched (BPG-007)', async () => {
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText('Sprint planning');

    await user.click(screen.getByRole('button', { name: 'Edit Sprint planning' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Edit booking' })).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);
  });
});
