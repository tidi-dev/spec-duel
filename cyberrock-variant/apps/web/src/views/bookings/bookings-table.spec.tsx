import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookingDto } from '@roombook/contract';
import { atlas, bookingOf } from './booking-test-fixtures';
import { BookingsTable } from './bookings-table';

const renderTable = (bookings: BookingDto[], busy = false) => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(<BookingsTable bookings={bookings} rooms={[atlas]} busy={busy} onEdit={onEdit} onDelete={onDelete} />);
  return { onEdit, onDelete };
};

const bodyRows = () => within(screen.getByRole('table', { name: 'Bookings' })).getAllByRole('row').slice(1);

describe('BookingsTable', () => {
  it('shows title, room name, organizer, start, end and confirmation status of a booking (BPG-002)', () => {
    renderTable([bookingOf()]);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Title', 'Room', 'Organizer', 'Start (UTC)', 'End (UTC)', 'Confirmation', 'Actions']);
    const cells = within(bodyRows()[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 6)).toEqual([
      'Sprint planning',
      'Atlas',
      'ann@example.com',
      '2030-01-07 09:00 UTC',
      '2030-01-07 10:00 UTC',
      'PENDING',
    ]);
  });

  it('shows the room id when the room is not among the loaded rooms', () => {
    const roomId = '9d8c7b6a-0000-4000-8000-000000000099';
    renderTable([bookingOf({ roomId })]);

    expect(within(bodyRows()[0]).getByText(roomId)).toBeInTheDocument();
  });

  it('shows "No bookings yet" for an empty result (BPG-004)', () => {
    renderTable([]);

    expect(screen.getByText('No bookings yet')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it('hands the row booking to the edit and delete handlers', async () => {
    const user = userEvent.setup();
    const booking = bookingOf();
    const { onEdit, onDelete } = renderTable([booking]);

    await user.click(screen.getByRole('button', { name: 'Edit Sprint planning' }));
    await user.click(screen.getByRole('button', { name: 'Delete Sprint planning' }));

    expect(onEdit).toHaveBeenCalledWith(booking);
    expect(onDelete).toHaveBeenCalledWith(booking);
  });

  it('disables the row actions while busy', () => {
    renderTable([bookingOf()], true);

    expect(screen.getByRole('button', { name: 'Edit Sprint planning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Sprint planning' })).toBeDisabled();
  });
});
