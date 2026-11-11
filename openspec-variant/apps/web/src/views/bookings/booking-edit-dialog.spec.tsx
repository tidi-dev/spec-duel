import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { updateBooking } from '../../services/booking.service';
import { BookingEditDialog } from './booking-edit-dialog';
import { buildTestBooking } from './booking-test-data';

jest.mock('../../services/booking.service', () => ({ updateBooking: jest.fn() }));

const mockedUpdateBooking = updateBooking as jest.MockedFunction<typeof updateBooking>;

const booking = buildTestBooking(1);

const OVERLAP_MESSAGE = 'The room already has a booking that overlaps this time span';

const overlapError = () =>
  new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE });

const setTime = (dialog: ReturnType<typeof within>, label: string, value: string) =>
  fireEvent.change(dialog.getByLabelText(label), { target: { value } });

const setup = () => {
  const user = userEvent.setup();
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(<BookingEditDialog booking={booking} onSaved={onSaved} onClose={onClose} />);
  const dialog = within(screen.getByRole('dialog', { name: 'Edit booking' }));
  return { user, onSaved, onClose, dialog };
};

describe('BookingEditDialog', () => {
  beforeEach(() => {
    mockedUpdateBooking.mockReset();
    mockedUpdateBooking.mockResolvedValue(booking);
  });

  it("is prefilled with the booking's title, start and end", () => {
    const { dialog } = setup();

    expect(dialog.getByLabelText('Title')).toHaveValue('Booking 01');
    expect(dialog.getByLabelText('Start (UTC)')).toHaveValue('2030-01-01T09:30');
    expect(dialog.getByLabelText('End (UTC)')).toHaveValue('2030-01-01T10:30');
  });

  it('sends one update with the new title and the start and end, then reports it saved', async () => {
    const { user, onSaved, dialog } = setup();
    await user.clear(dialog.getByLabelText('Title'));
    await user.type(dialog.getByLabelText('Title'), 'Retro');

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedUpdateBooking).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking).toHaveBeenCalledWith(booking.id, {
      title: 'Retro',
      startsAt: '2030-01-01T09:30:00.000Z',
      endsAt: '2030-01-01T10:30:00.000Z',
    });
  });

  it('sends nothing when cancelled', async () => {
    const { user, onSaved, onClose, dialog } = setup();
    await user.type(dialog.getByLabelText('Title'), ' changed');

    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('sends nothing and marks the title when it is empty', async () => {
    const { user, dialog } = setup();
    await user.clear(dialog.getByLabelText('Title'));

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByText('Title is required')).toBeInTheDocument();
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
  });

  it.each([
    ['equal to', '2030-01-01T09:30'],
    ['earlier than', '2030-01-01T09:00'],
  ])('sends nothing and marks the end when it is %s the start', async (_, endValue) => {
    const { user, onSaved, dialog } = setup();
    fireEvent.change(dialog.getByLabelText('End (UTC)'), { target: { value: endValue } });

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByText('End must be later than start')).toBeInTheDocument();
    expect(dialog.getByLabelText('End (UTC)')).toBeInvalid();
    expect(mockedUpdateBooking).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the API message and keeps the entered values when the update fails', async () => {
    mockedUpdateBooking.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND,
        message: 'Booking 123 was not found',
      }),
    );
    const { user, onSaved, onClose, dialog } = setup();
    await user.type(dialog.getByLabelText('Title'), ' v2');

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Booking 123 was not found');
    expect(dialog.getByLabelText('Title')).toHaveValue('Booking 01 v2');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open with the overlap message and the entered values when the update is rejected', async () => {
    mockedUpdateBooking.mockRejectedValue(overlapError());
    const { user, onSaved, onClose, dialog } = setup();
    await user.type(dialog.getByLabelText('Title'), ' v2');
    setTime(dialog, 'Start (UTC)', '2030-01-01T11:00');
    setTime(dialog, 'End (UTC)', '2030-01-01T12:00');

    await user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(screen.getByRole('dialog', { name: 'Edit booking' })).toBeInTheDocument();
    expect(dialog.getByLabelText('Title')).toHaveValue('Booking 01 v2');
    expect(dialog.getByLabelText('Start (UTC)')).toHaveValue('2030-01-01T11:00');
    expect(dialog.getByLabelText('End (UTC)')).toHaveValue('2030-01-01T12:00');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends one more update with the corrected end after an overlap rejection, then reports it saved', async () => {
    mockedUpdateBooking.mockRejectedValueOnce(overlapError());
    const { user, onSaved, dialog } = setup();
    setTime(dialog, 'End (UTC)', '2030-01-01T12:00');
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialog.findByRole('alert');

    setTime(dialog, 'End (UTC)', '2030-01-01T10:00');
    await user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockedUpdateBooking).toHaveBeenCalledTimes(2);
    expect(mockedUpdateBooking).toHaveBeenLastCalledWith(booking.id, {
      title: 'Booking 01',
      startsAt: '2030-01-01T09:30:00.000Z',
      endsAt: '2030-01-01T10:00:00.000Z',
    });
  });
});
