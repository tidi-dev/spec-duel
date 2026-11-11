import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationStatusEnum, DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { BookingsTable } from './bookings-table';

const rooms: RoomDto[] = [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 }];
const UNKNOWN_ROOM_ID = 'a1b2c3d4-0000-4000-8000-000000000099';

const bookings: BookingDto[] = [
  {
    id: 'b1b2c3d4-0000-4000-8000-000000000001',
    roomId: rooms[0].id,
    title: 'Planning',
    organizerEmail: 'ann@example.com',
    startsAt: '2030-01-07T09:00:00.000Z',
    endsAt: '2030-01-07T10:00:00.000Z',
    confirmationStatus: ConfirmationStatusEnum.SENT,
    confirmationAttempts: 1,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
  },
  {
    id: 'b1b2c3d4-0000-4000-8000-000000000002',
    roomId: UNKNOWN_ROOM_ID,
    title: 'Retro',
    organizerEmail: 'bob@example.com',
    startsAt: '2030-01-08T13:00:00.000Z',
    endsAt: '2030-01-08T14:30:00.000Z',
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
  },
];

const renderTable = (page = 1) => {
  const handlers = { onPageChange: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
  render(<BookingsTable bookings={bookings} rooms={rooms} total={25} page={page} {...handlers} />);
  return handlers;
};

const bodyRows = () => within(screen.getByRole('table', { name: 'Bookings' })).getAllByRole('row').slice(1);

describe('BookingsTable', () => {
  it('renders a table named Bookings with the seven columns', () => {
    renderTable();

    const headers = within(screen.getByRole('table', { name: 'Bookings' })).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Title',
      'Room',
      'Organizer',
      'Start',
      'End',
      'Confirmation',
      'Actions',
    ]);
  });

  it('shows each booking with the room name, locale times and confirmation status', () => {
    renderTable();

    const [first] = bodyRows();
    expect(bodyRows()).toHaveLength(2);
    expect(within(first).getByText('Planning')).toBeInTheDocument();
    expect(within(first).getByText('Room 01')).toBeInTheDocument();
    expect(within(first).getByText('ann@example.com')).toBeInTheDocument();
    expect(within(first).getByText(new Date(bookings[0].startsAt).toLocaleString())).toBeInTheDocument();
    expect(within(first).getByText(new Date(bookings[0].endsAt).toLocaleString())).toBeInTheDocument();
    expect(within(first).getByText('SENT')).toBeInTheDocument();
  });

  it('shows the room id when the room is not in the list', () => {
    renderTable();

    expect(within(bodyRows()[1]).getByText(UNKNOWN_ROOM_ID)).toBeInTheDocument();
  });

  it('calls the edit and delete handlers with the booking of the row', async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderTable();

    await user.click(screen.getByRole('button', { name: 'Edit Retro' }));
    await user.click(screen.getByRole('button', { name: 'Delete Planning' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(bookings[1]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(bookings[0]);
  });

  it('paginates at the default page size and reports page changes', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderTable(2);

    expect(screen.getByText(`${DEFAULT_PAGE_SIZE + 1}–${DEFAULT_PAGE_SIZE * 2} of 25`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });
});
