import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking } from '../../services/booking.service';
import { ATLAS_ID, atlas, bookingOf } from './booking-test-fixtures';
import { CreateBookingForm } from './create-booking-form';

jest.mock('../../services/booking.service', () => ({ createBooking: jest.fn() }));

const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const B1 = {
  roomId: ATLAS_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const unavailable = () =>
  new ApiError({ statusCode: 503, errorCode: ErrorCodeEnum.SERVICE_UNAVAILABLE, message: 'Booking service is unavailable' });

const setDateTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const fillB1 = async (user: UserEvent) => {
  await user.selectOptions(screen.getByLabelText('Room'), 'Atlas');
  await user.type(screen.getByLabelText('Title'), 'Sprint planning');
  await user.type(screen.getByLabelText('Organizer email'), 'ann@example.com');
  setDateTime('Start (UTC)', '2030-01-07T09:00');
  setDateTime('End (UTC)', '2030-01-07T10:00');
};

const submit = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Create booking' }));

const keyOfCall = (index: number) => mockedCreateBooking.mock.calls[index][1];

const setup = () => {
  const onCreated = jest.fn();
  render(<CreateBookingForm rooms={[atlas]} onCreated={onCreated} />);
  return { onCreated, user: userEvent.setup() };
};

describe('CreateBookingForm', () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(bookingOf());
  });

  it('sends B1 with a UUID key, resets the form and reports the creation (BPG-005)', async () => {
    const { onCreated, user } = setup();
    await fillB1(user);

    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockedCreateBooking.mock.calls[0][0]).toStrictEqual(B1);
    expect(keyOfCall(0)).toMatch(UUID_PATTERN);
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Room')).toHaveValue('');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('');
  });

  it('shows an error on an empty title and does not call the API (BPG-005)', async () => {
    const { user } = setup();
    await fillB1(user);
    await user.clear(screen.getByLabelText('Title'));

    await submit(user);

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInvalid();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
  });

  it('shows an error on the email "x" and does not call the API (BPG-005)', async () => {
    const { user } = setup();
    await fillB1(user);
    await user.clear(screen.getByLabelText('Organizer email'));
    await user.type(screen.getByLabelText('Organizer email'), 'x');

    await submit(user);

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
  });

  it('shows an error when end is not later than start and does not call the API (BPG-005)', async () => {
    const { user } = setup();
    await fillB1(user);
    setDateTime('End (UTC)', '2030-01-07T09:00');

    await submit(user);

    expect(await screen.findByText('End must be later than start')).toBeInTheDocument();
    expect(screen.getByLabelText('End (UTC)')).toBeInvalid();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
  });

  it('shows the API message and keeps the entered values on 404 NOT_FOUND.ROOM (BPG-005)', async () => {
    const message = `Room ${ATLAS_ID} was not found`;
    mockedCreateBooking.mockRejectedValue(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message }),
    );
    const { onCreated, user } = setup();
    await fillB1(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Title')).toHaveValue('Sprint planning');
    expect(screen.getByLabelText('Room')).toHaveValue(ATLAS_ID);
    expect(screen.getByLabelText('Organizer email')).toHaveValue('ann@example.com');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('2030-01-07T09:00');
    expect(screen.getByLabelText('End (UTC)')).toHaveValue('2030-01-07T10:00');
    expect(onCreated).not.toHaveBeenCalled();
  });

  describe('idempotency key (BPG-006, R-14)', () => {
    it.each([
      ['a 503', unavailable()],
      ['a network error', new Error('Network Error')],
      [
        'a 409 in-progress answer',
        new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS, message: 'In progress' }),
      ],
    ])('sends the same key when the unchanged form is submitted again after %s', async (_, failure) => {
      mockedCreateBooking.mockRejectedValueOnce(failure);
      const { onCreated, user } = setup();
      await fillB1(user);

      await submit(user);
      await screen.findByRole('alert');
      await submit(user);

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockedCreateBooking).toHaveBeenCalledTimes(2);
      expect(keyOfCall(1)).toBe(keyOfCall(0));
      expect(mockedCreateBooking.mock.calls[1][0]).toStrictEqual(B1);
    });

    it('sends a new key when the title was changed after a 503', async () => {
      mockedCreateBooking.mockRejectedValueOnce(unavailable());
      const { onCreated, user } = setup();
      await fillB1(user);

      await submit(user);
      await screen.findByRole('alert');
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Retro');
      await submit(user);

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockedCreateBooking.mock.calls[1][0]).toStrictEqual({ ...B1, title: 'Retro' });
      expect(keyOfCall(1)).toMatch(UUID_PATTERN);
      expect(keyOfCall(1)).not.toBe(keyOfCall(0));
    });

    it('sends a new key when the same values are submitted again after a 201', async () => {
      const { onCreated, user } = setup();
      await fillB1(user);
      await submit(user);
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

      await fillB1(user);
      await submit(user);

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
      expect(mockedCreateBooking.mock.calls[1][0]).toStrictEqual(B1);
      expect(keyOfCall(1)).not.toBe(keyOfCall(0));
    });
  });
});
