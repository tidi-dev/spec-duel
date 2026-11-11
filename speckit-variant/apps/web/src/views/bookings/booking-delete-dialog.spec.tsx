import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { deleteBooking } from '../../services/booking.service';
import { BookingDeleteDialog } from './booking-delete-dialog';

jest.mock('../../services/booking.service', () => ({ deleteBooking: jest.fn() }));

const mockedDeleteBooking = deleteBooking as jest.MockedFunction<typeof deleteBooking>;

const booking: BookingDto = {
  id: 'b1b2c3d4-0000-4000-8000-000000000001',
  roomId: 'a1b2c3d4-0000-4000-8000-000000000001',
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.SENT,
  confirmationAttempts: 1,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const dialog = () => screen.getByRole('dialog', { name: 'Delete booking' });
const button = (name: string) => within(dialog()).getByRole('button', { name });

const renderDialog = () => {
  const handlers = { onClose: jest.fn(), onDeleted: jest.fn() };
  render(<BookingDeleteDialog booking={booking} {...handlers} />);
  return { user: userEvent.setup(), ...handlers };
};

describe('BookingDeleteDialog', () => {
  beforeEach(() => {
    mockedDeleteBooking.mockReset();
    mockedDeleteBooking.mockResolvedValue(undefined);
  });

  it('renders a dialog named Delete booking that asks to confirm with the booking title', () => {
    renderDialog();

    expect(within(dialog()).getByText('Delete the booking "Planning"? This cannot be undone.')).toBeInTheDocument();
    expect(mockedDeleteBooking).not.toHaveBeenCalled();
  });

  it('deletes the booking and then calls onDeleted when Delete is chosen', async () => {
    const { user, onDeleted, onClose } = renderDialog();

    await user.click(button('Delete'));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockedDeleteBooking).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBooking).toHaveBeenCalledWith(booking.id);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends nothing when Cancel is chosen', async () => {
    const { user, onDeleted, onClose } = renderDialog();

    await user.click(button('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBooking).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('shows the message of an ApiError and stays open', async () => {
    mockedDeleteBooking.mockRejectedValue(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'Booking not found' }),
    );
    const { user, onDeleted, onClose } = renderDialog();

    await user.click(button('Delete'));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Booking not found');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
