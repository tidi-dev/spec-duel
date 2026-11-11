import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking } from '../../services/booking.service';
import { ATLAS_ID, atlas, bookingOf } from './booking-test-fixtures';
import { CreateBookingForm } from './create-booking-form';

jest.mock('../../services/booking.service', () => ({ createBooking: jest.fn() }));

const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const OVERLAP_MESSAGE = 'The room is already booked in that time span';

const B1 = {
  roomId: ATLAS_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const overlap = () =>
  new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE });

const keyOfCall = (index: number) => mockedCreateBooking.mock.calls[index][1];

const setupFilledForm = async () => {
  const onCreated = jest.fn();
  render(<CreateBookingForm rooms={[atlas]} onCreated={onCreated} />);
  const user = userEvent.setup();
  const form = within(screen.getByRole('form', { name: 'New booking' }));
  await user.selectOptions(form.getByLabelText('Room'), 'Atlas');
  await user.type(form.getByLabelText('Title'), 'Sprint planning');
  await user.type(form.getByLabelText('Organizer email'), 'ann@example.com');
  fireEvent.change(form.getByLabelText('Start (UTC)'), { target: { value: '2030-01-07T09:00' } });
  fireEvent.change(form.getByLabelText('End (UTC)'), { target: { value: '2030-01-07T10:00' } });
  const submit = () => user.click(form.getByRole('button', { name: 'Create booking' }));
  return { form, onCreated, submit };
};

describe('CreateBookingForm on 409 CONFLICT.BOOKING_OVERLAP', () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(bookingOf());
    mockedCreateBooking.mockRejectedValueOnce(overlap());
  });

  it('shows the API message in the form and keeps all five entered values (BPG-005)', async () => {
    const { form, onCreated, submit } = await setupFilledForm();

    await submit();

    expect(await form.findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(form.getByLabelText('Room')).toHaveValue(ATLAS_ID);
    expect(form.getByLabelText('Title')).toHaveValue('Sprint planning');
    expect(form.getByLabelText('Organizer email')).toHaveValue('ann@example.com');
    expect(form.getByLabelText('Start (UTC)')).toHaveValue('2030-01-07T09:00');
    expect(form.getByLabelText('End (UTC)')).toHaveValue('2030-01-07T10:00');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('sends a new idempotency key when the unchanged form is submitted again (BPG-005, BPG-006)', async () => {
    const { form, onCreated, submit } = await setupFilledForm();

    await submit();
    await form.findByRole('alert');
    await submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(2);
    expect(mockedCreateBooking.mock.calls[0][0]).toStrictEqual(B1);
    expect(mockedCreateBooking.mock.calls[1][0]).toStrictEqual(B1);
    expect(keyOfCall(0)).toMatch(UUID_PATTERN);
    expect(keyOfCall(1)).toMatch(UUID_PATTERN);
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });
});
