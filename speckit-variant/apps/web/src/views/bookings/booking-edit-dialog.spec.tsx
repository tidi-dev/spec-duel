import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { updateBooking } from '../../services/booking.service';
import { BookingEditDialog } from './booking-edit-dialog';

jest.mock('../../services/booking.service', () => ({ updateBooking: jest.fn() }));

const mockedUpdateBooking = updateBooking as jest.MockedFunction<typeof updateBooking>;

const START = '2030-01-07T09:00';
const END = '2030-01-07T10:00';
const NEW_END = '2030-01-07T11:30';

const booking: BookingDto = {
  id: 'b1b2c3d4-0000-4000-8000-000000000001',
  roomId: 'a1b2c3d4-0000-4000-8000-000000000001',
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: new Date(START).toISOString(),
  endsAt: new Date(END).toISOString(),
  confirmationStatus: ConfirmationStatusEnum.SENT,
  confirmationAttempts: 1,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const dialog = () => screen.getByRole('dialog', { name: 'Edit booking' });
const field = (label: string) => within(dialog()).getByLabelText(label);
const button = (name: string) => within(dialog()).getByRole('button', { name });

const renderDialog = () => {
  const handlers = { onClose: jest.fn(), onSaved: jest.fn() };
  render(<BookingEditDialog booking={booking} {...handlers} />);
  return { user: userEvent.setup(), ...handlers };
};

describe('BookingEditDialog', () => {
  beforeEach(() => {
    mockedUpdateBooking.mockReset();
    mockedUpdateBooking.mockResolvedValue(booking);
  });

  it('renders a dialog named Edit booking prefilled with title, start and end in local time', () => {
    renderDialog();

    expect(field('Title')).toHaveValue('Planning');
    expect(field('Start')).toHaveValue(START);
    expect(field('End')).toHaveValue(END);
  });

  it('saves title, start and end as UTC ISO and then calls onSaved', async () => {
    const { user, onSaved, onClose } = renderDialog();
    await user.clear(field('Title'));
    await user.type(field('Title'), 'Retro');
    fireEvent.change(field('End'), { target: { value: NEW_END } });

    await user.click(button('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking).toHaveBeenCalledWith(booking.id, {
      title: 'Retro',
      startsAt: new Date(START).toISOString(),
      endsAt: new Date(NEW_END).toISOString(),
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a field error and sends no request when the end is not later than the start', async () => {
    const { user, onSaved } = renderDialog();
    fireEvent.change(field('End'), { target: { value: START } });

    await user.click(button('Save'));

    expect(await within(dialog()).findByText('End must be later than start')).toBeInTheDocument();
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the message of an ApiError and stays open', async () => {
    mockedUpdateBooking.mockRejectedValue(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND, message: 'Booking not found' }),
    );
    const { user, onSaved, onClose } = renderDialog();

    await user.click(button('Save'));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Booking not found');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the overlap message, keeps what was typed and saves on the next try', async () => {
    const message = 'The room is already booked for that time';
    mockedUpdateBooking.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message }),
    );
    const { user, onSaved, onClose } = renderDialog();
    await user.clear(field('Title'));
    await user.type(field('Title'), 'Retro');
    fireEvent.change(field('End'), { target: { value: NEW_END } });

    await user.click(button('Save'));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(message);
    expect(field('Title')).toHaveValue('Retro');
    expect(field('Start')).toHaveValue(START);
    expect(field('End')).toHaveValue(NEW_END);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(button('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('calls onClose without a request when Cancel is chosen', async () => {
    const { user, onClose, onSaved } = renderDialog();

    await user.click(button('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
