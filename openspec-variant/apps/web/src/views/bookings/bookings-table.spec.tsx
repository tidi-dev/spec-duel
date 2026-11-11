import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationStatusEnum } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { buildTestBooking, testRooms } from './booking-test-data';
import { BookingsTable } from './bookings-table';

const UNKNOWN_ROOM_ID = '99999999-0000-4000-8000-000000000099';

const bookings: BookingDto[] = [
  buildTestBooking(1),
  { ...buildTestBooking(2, UNKNOWN_ROOM_ID), confirmationStatus: ConfirmationStatusEnum.SENT },
];

const renderTable = (items: BookingDto[]) => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(<BookingsTable bookings={items} rooms={testRooms} onEdit={onEdit} onDelete={onDelete} />);
  const table = screen.getByRole('table', { name: 'Bookings' });
  return { onEdit, onDelete, table, bodyRows: within(table).getAllByRole('row').slice(1) };
};

describe('BookingsTable', () => {
  it('renders the six columns with UTC in the start and end headers', () => {
    const { table } = renderTable(bookings);

    ['Title', 'Room', 'Organizer', 'Start (UTC)', 'End (UTC)', 'Confirmation'].forEach((name) =>
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument(),
    );
  });

  it('renders a row per booking with the room name and times as YYYY-MM-DD HH:mm', () => {
    const { bodyRows } = renderTable(bookings);

    expect(bodyRows).toHaveLength(2);
    const firstRow = within(bodyRows[0]);
    expect(firstRow.getByText('Booking 01')).toBeInTheDocument();
    expect(firstRow.getByText('Room 01')).toBeInTheDocument();
    expect(firstRow.getByText('organizer01@example.com')).toBeInTheDocument();
    expect(firstRow.getByText('2030-01-01 09:30')).toBeInTheDocument();
    expect(firstRow.getByText('2030-01-01 10:30')).toBeInTheDocument();
    expect(firstRow.getByText('PENDING')).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText('SENT')).toBeInTheDocument();
  });

  it('shows the room id when the room is not in the room list', () => {
    const { bodyRows } = renderTable(bookings);

    expect(within(bodyRows[1]).getByText(UNKNOWN_ROOM_ID)).toBeInTheDocument();
  });

  it('renders the empty message when there are no bookings', () => {
    const { bodyRows } = renderTable([]);

    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText('No bookings found.')).toBeInTheDocument();
  });

  it('calls back with the booking of the row whose edit or delete action is used', async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderTable(bookings);

    await user.click(screen.getByRole('button', { name: 'Edit Booking 02' }));
    await user.click(screen.getByRole('button', { name: 'Delete Booking 01' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(bookings[1]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(bookings[0]);
  });
});
