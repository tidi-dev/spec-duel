import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { ConfirmationStatusEnum, ErrorCodeEnum, MAX_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking, listBookings, updateBooking } from '../../services/booking.service';
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
const mockedListRooms = listRooms as jest.MockedFunction<typeof listRooms>;

const OVERLAP_MESSAGE = 'The room is already booked for that time';
const overlapError = (): ApiError =>
  new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE });

const rooms: RoomDto[] = [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 }];

const planning: BookingDto = {
  id: 'b1b2c3d4-0000-4000-8000-000000000001',
  roomId: rooms[0].id,
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-01T09:00:00.000Z',
  endsAt: '2030-01-01T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

let stored: BookingDto[];

const table = () => screen.getByRole('table', { name: 'Bookings' });
const tableBehindDialog = () => screen.getByRole('table', { name: 'Bookings', hidden: true });
const form = () => screen.getByRole('form', { name: 'New booking' });
const dialog = () => screen.getByRole('dialog', { name: 'Edit booking' });

const renderLoaded = async (): Promise<UserEvent> => {
  render(<BookingsPage />);
  await within(await screen.findByRole('table', { name: 'Bookings' })).findByText('Room 01');
  await within(form()).findByRole('option', { name: 'Room 01' });
  return userEvent.setup();
};

describe('BookingsPage after an overlap rejection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    stored = [planning];
    mockedListRooms.mockResolvedValue({ items: rooms, total: rooms.length, page: 1, limit: MAX_PAGE_SIZE });
    mockedListBookings.mockImplementation(({ page, limit }) =>
      Promise.resolve({ items: stored, total: stored.length, page, limit }),
    );
  });

  it('shows the message inside the create form and does not reload the list', async () => {
    mockedCreateBooking.mockRejectedValueOnce(overlapError());
    const user = await renderLoaded();

    await user.selectOptions(within(form()).getByLabelText('Room'), 'Room 01');
    await user.type(within(form()).getByLabelText('Title'), 'Demo');
    await user.type(within(form()).getByLabelText('Organizer email'), 'cy@example.com');
    fireEvent.change(within(form()).getByLabelText('Start'), { target: { value: '2030-01-01T09:30' } });
    fireEvent.change(within(form()).getByLabelText('End'), { target: { value: '2030-01-01T10:30' } });
    await user.click(within(form()).getByRole('button', { name: 'Create booking' }));

    expect(await within(form()).findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(within(table()).queryByText('Demo')).not.toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);
  });

  it('keeps the edit dialog open with the typed title and the stored row, then saves on the next try', async () => {
    mockedUpdateBooking.mockRejectedValueOnce(overlapError());
    mockedUpdateBooking.mockImplementation((id, changes) => {
      stored = stored.map((booking) => (booking.id === id ? { ...booking, ...changes } : booking));
      return Promise.resolve(stored[0]);
    });
    const user = await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Edit Planning' }));
    await user.clear(within(dialog()).getByLabelText('Title'));
    await user.type(within(dialog()).getByLabelText('Title'), 'Kickoff');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Kickoff');
    expect(within(tableBehindDialog()).getByText('Planning')).toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(1);

    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await within(table()).findByText('Kickoff')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(table()).queryByText('Planning')).not.toBeInTheDocument();
    expect(mockedListBookings).toHaveBeenCalledTimes(2);
  });
});
