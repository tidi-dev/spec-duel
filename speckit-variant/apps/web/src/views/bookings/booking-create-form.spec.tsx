import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking } from '../../services/booking.service';
import { BookingCreateForm } from './booking-create-form';

jest.mock('../../services/booking.service', () => ({ createBooking: jest.fn() }));

const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const rooms: RoomDto[] = [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 }];
const START = '2030-01-07T09:00';
const END = '2030-01-07T10:00';

const created: BookingDto = {
  id: 'b1b2c3d4-0000-4000-8000-000000000001',
  roomId: rooms[0].id,
  title: 'Planning',
  organizerEmail: 'ann@example.com',
  startsAt: new Date(START).toISOString(),
  endsAt: new Date(END).toISOString(),
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const form = () => screen.getByRole('form', { name: 'New booking' });
const field = (label: string) => within(form()).getByLabelText(label);
const setTime = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const submit = (user: UserEvent) => user.click(within(form()).getByRole('button', { name: 'Create booking' }));
const keyOfCall = (index: number) => mockedCreateBooking.mock.calls[index][1];

const fillForm = async (user: UserEvent, end = END) => {
  await user.selectOptions(field('Room'), 'Room 01');
  await user.type(field('Title'), 'Planning');
  await user.type(field('Organizer email'), 'ann@example.com');
  setTime('Start', START);
  setTime('End', end);
};

const renderForm = () => {
  const onCreated = jest.fn();
  render(<BookingCreateForm rooms={rooms} onCreated={onCreated} />);
  return { user: userEvent.setup(), onCreated };
};

describe('BookingCreateForm', () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(created);
  });

  it('renders a form named New booking with its five fields and the submit button', () => {
    renderForm();

    expect(within(form()).getByRole('combobox', { name: 'Room' })).toBeInTheDocument();
    expect(within(form()).getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    expect(within(form()).getByRole('textbox', { name: 'Organizer email' })).toBeInTheDocument();
    expect(field('Start')).toHaveAttribute('type', 'datetime-local');
    expect(field('End')).toHaveAttribute('type', 'datetime-local');
    expect(within(form()).getByRole('button', { name: 'Create booking' })).toBeInTheDocument();
  });

  it('shows a field error and sends no request when the end is before the start', async () => {
    const { user, onCreated } = renderForm();
    await fillForm(user, '2030-01-07T08:00');

    await submit(user);

    expect(await within(form()).findByText('End must be later than start')).toBeInTheDocument();
    expect(field('End')).toBeInvalid();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('creates the booking with UTC ISO times and a UUID key, then clears the form and calls onCreated', async () => {
    const { user, onCreated } = renderForm();
    await fillForm(user);

    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockedCreateBooking).toHaveBeenCalledWith(
      {
        roomId: rooms[0].id,
        title: 'Planning',
        organizerEmail: 'ann@example.com',
        startsAt: new Date(START).toISOString(),
        endsAt: new Date(END).toISOString(),
      },
      expect.stringMatching(UUID_V4),
    );
    expect(field('Room')).toHaveValue('');
    expect(field('Title')).toHaveValue('');
    expect(field('Organizer email')).toHaveValue('');
    expect(field('Start')).toHaveValue('');
    expect(field('End')).toHaveValue('');
  });

  it('uses the same key for an unchanged resubmit after a rejection that is not an ApiError', async () => {
    const { user, onCreated } = renderForm();
    mockedCreateBooking.mockRejectedValueOnce(new Error('Network Error'));
    await fillForm(user);

    await submit(user);
    expect(await within(form()).findByRole('alert')).toHaveTextContent('Network Error');
    expect(field('Title')).toHaveValue('Planning');
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(2);
    expect(keyOfCall(1)).toBe(keyOfCall(0));
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the message of an ApiError and uses a new key for the next submit', async () => {
    const { user, onCreated } = renderForm();
    mockedCreateBooking.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'Room not found' }),
    );
    await fillForm(user);

    await submit(user);
    expect(await within(form()).findByRole('alert')).toHaveTextContent('Room not found');
    expect(onCreated).not.toHaveBeenCalled();
    await submit(user);

    await waitFor(() => expect(mockedCreateBooking).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).toMatch(UUID_V4);
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('uses a new key for the submit after a success', async () => {
    const { user, onCreated } = renderForm();
    await fillForm(user);
    await submit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    await fillForm(user);
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).toMatch(UUID_V4);
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it.each(['Room', 'Title', 'Organizer email', 'Start', 'End'])(
    'uses a new key when %s changes after a network error',
    async (label) => {
      const { user } = renderForm();
      mockedCreateBooking.mockRejectedValueOnce(new Error('Network Error'));
      await fillForm(user);
      await submit(user);
      await within(form()).findByRole('alert');

      const control = field(label);
      if (label === 'Room') {
        await user.selectOptions(control, '');
        await user.selectOptions(control, 'Room 01');
      } else if (label === 'Start') {
        setTime(label, '2030-01-07T08:30');
      } else if (label === 'End') {
        setTime(label, '2030-01-07T11:00');
      } else {
        await user.type(control, 'x');
        await user.keyboard('{Backspace}');
      }
      await submit(user);

      await waitFor(() => expect(mockedCreateBooking).toHaveBeenCalledTimes(2));
      expect(keyOfCall(1)).not.toBe(keyOfCall(0));
    },
  );
});
