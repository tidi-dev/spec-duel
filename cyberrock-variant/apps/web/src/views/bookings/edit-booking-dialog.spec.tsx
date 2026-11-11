import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { updateBooking } from '../../services/booking.service';
import { bookingOf } from './booking-test-fixtures';
import { EditBookingDialog } from './edit-booking-dialog';

jest.mock('../../services/booking.service', () => ({ updateBooking: jest.fn() }));

const mockedUpdateBooking = updateBooking as jest.MockedFunction<typeof updateBooking>;

const precise = bookingOf({ startsAt: '2030-01-07T09:00:30.123Z', endsAt: '2030-01-07T10:00:45.678Z' });

const setup = () => {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(<EditBookingDialog booking={precise} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved, user: userEvent.setup(), dialog: within(screen.getByRole('dialog', { name: 'Edit booking' })) };
};

const save = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Save' }));

describe('EditBookingDialog', () => {
  beforeEach(() => {
    mockedUpdateBooking.mockReset();
    mockedUpdateBooking.mockResolvedValue(precise);
  });

  it('shows title, start and end of the booking, times as UTC minutes', () => {
    const { dialog } = setup();

    expect(dialog.getByLabelText('Title')).toHaveValue('Sprint planning');
    expect(dialog.getByLabelText('Start (UTC)')).toHaveValue('2030-01-07T09:00');
    expect(dialog.getByLabelText('End (UTC)')).toHaveValue('2030-01-07T10:00');
  });

  it('sends exactly { title } when only the title changed on a booking with seconds and milliseconds (BPG-007, R-17)', async () => {
    const { dialog, onSaved, user } = setup();
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');

    await save(user);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking.mock.calls[0]).toStrictEqual([precise.id, { title: 'Retro' }]);
  });

  it('saves a title change on a booking shorter than a minute, whose start and end show the same minute (BPG-007, R-17)', async () => {
    const brief = bookingOf({ startsAt: '2030-01-07T10:00:00.000Z', endsAt: '2030-01-07T10:00:30.000Z' });
    const onSaved = jest.fn();
    render(<EditBookingDialog booking={brief} onClose={jest.fn()} onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Retro');

    await save(user);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking.mock.calls[0]).toStrictEqual([brief.id, { title: 'Retro' }]);
  });

  it('sends exactly { startsAt } when only the start changed (R-17)', async () => {
    const { dialog, onSaved, user } = setup();
    fireEvent.change(dialog.getByLabelText('Start (UTC)'), { target: { value: '2030-01-07T08:00' } });

    await save(user);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking.mock.calls[0]).toStrictEqual([precise.id, { startsAt: '2030-01-07T08:00:00.000Z' }]);
  });

  it('does not call the API and closes when saved untouched (BPG-007)', async () => {
    const { onClose, onSaved, user } = setup();

    await save(user);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the span error of the create form when end is not later than start (BPG-007, R-11)', async () => {
    const { dialog, onClose, user } = setup();
    fireEvent.change(dialog.getByLabelText('End (UTC)'), { target: { value: '2030-01-07T09:00' } });

    await save(user);

    expect(await dialog.findByText('End must be later than start')).toBeInTheDocument();
    expect(dialog.getByLabelText('End (UTC)')).toBeInvalid();
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the API message in the dialog and keeps the values on a 400 (BPG-007)', async () => {
    mockedUpdateBooking.mockRejectedValue(
      new ApiError({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION, message: 'endsAt must be later than startsAt' }),
    );
    const { dialog, onClose, onSaved, user } = setup();
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');

    await save(user);

    expect(await dialog.findByRole('alert')).toHaveTextContent('endsAt must be later than startsAt');
    expect(dialog.getByLabelText('Title')).toHaveValue('Retro');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without calling the API on Cancel', async () => {
    const { onClose, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
  });
});
