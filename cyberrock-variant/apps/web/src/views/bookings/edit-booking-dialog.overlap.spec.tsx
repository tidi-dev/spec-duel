import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { updateBooking } from '../../services/booking.service';
import { bookingOf } from './booking-test-fixtures';
import { EditBookingDialog } from './edit-booking-dialog';

jest.mock('../../services/booking.service', () => ({ updateBooking: jest.fn() }));

const mockedUpdateBooking = updateBooking as jest.MockedFunction<typeof updateBooking>;

const OVERLAP_MESSAGE = 'The room is already booked in that time span';

const stored = bookingOf({ startsAt: '2030-01-07T10:00:00.000Z', endsAt: '2030-01-07T11:00:00.000Z' });

describe('EditBookingDialog on 409 CONFLICT.BOOKING_OVERLAP', () => {
  beforeEach(() => {
    mockedUpdateBooking.mockReset();
    mockedUpdateBooking.mockRejectedValue(
      new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE }),
    );
  });

  it('stays open, shows the API message and keeps the entered title, start and end (BPG-007)', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(<EditBookingDialog booking={stored} onClose={onClose} onSaved={onSaved} />);
    const user = userEvent.setup();
    const dialog = within(screen.getByRole('dialog', { name: 'Edit booking' }));
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');
    fireEvent.change(dialog.getByLabelText('Start (UTC)'), { target: { value: '2030-01-07T09:30' } });
    fireEvent.change(dialog.getByLabelText('End (UTC)'), { target: { value: '2030-01-07T10:30' } });

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(mockedUpdateBooking.mock.calls).toStrictEqual([
      [stored.id, { title: 'Retro', startsAt: '2030-01-07T09:30:00.000Z', endsAt: '2030-01-07T10:30:00.000Z' }],
    ]);
    expect(screen.getByRole('dialog', { name: 'Edit booking' })).toBeInTheDocument();
    expect(dialog.getByLabelText('Title')).toHaveValue('Retro');
    expect(dialog.getByLabelText('Start (UTC)')).toHaveValue('2030-01-07T09:30');
    expect(dialog.getByLabelText('End (UTC)')).toHaveValue('2030-01-07T10:30');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
