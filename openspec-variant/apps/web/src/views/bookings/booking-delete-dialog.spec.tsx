import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingDeleteDialog } from './booking-delete-dialog';
import { buildTestBooking } from './booking-test-data';

const booking = buildTestBooking(1);

const setup = () => {
  const user = userEvent.setup();
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(<BookingDeleteDialog booking={booking} onConfirm={onConfirm} onCancel={onCancel} />);
  const dialog = within(screen.getByRole('dialog', { name: 'Delete booking?' }));
  return { user, onConfirm, onCancel, dialog };
};

describe('BookingDeleteDialog', () => {
  it('asks for confirmation naming the booking', () => {
    const { dialog } = setup();

    expect(dialog.getByText(/Booking 01/)).toBeInTheDocument();
  });

  it('calls back with the booking when confirmed', async () => {
    const { user, onConfirm, onCancel, dialog } = setup();

    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(booking);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('only cancels when declined', async () => {
    const { user, onConfirm, onCancel, dialog } = setup();

    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
