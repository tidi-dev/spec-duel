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
const OVERLAP_MESSAGE = 'The room is already booked for that time';
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
const submit = (user: UserEvent) => user.click(within(form()).getByRole('button', { name: 'Create booking' }));
const keyOfCall = (index: number) => mockedCreateBooking.mock.calls[index][1];

const fillForm = async (user: UserEvent) => {
  await user.selectOptions(field('Room'), 'Room 01');
  await user.type(field('Title'), 'Planning');
  await user.type(field('Organizer email'), 'ann@example.com');
  fireEvent.change(field('Start'), { target: { value: START } });
  fireEvent.change(field('End'), { target: { value: END } });
};

describe('BookingCreateForm after an overlap rejection', () => {
  let user: UserEvent;
  let onCreated: jest.Mock;

  beforeEach(async () => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(created);
    mockedCreateBooking.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE }),
    );
    onCreated = jest.fn();
    render(<BookingCreateForm rooms={rooms} onCreated={onCreated} />);
    user = userEvent.setup();
    await fillForm(user);
    await submit(user);
  });

  it('shows the message of the API inside the form and keeps everything typed', async () => {
    expect(await within(form()).findByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(field('Room')).toHaveValue(rooms[0].id);
    expect(field('Title')).toHaveValue('Planning');
    expect(field('Organizer email')).toHaveValue('ann@example.com');
    expect(field('Start')).toHaveValue(START);
    expect(field('End')).toHaveValue(END);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('sends the next submit with a new UUID key', async () => {
    await within(form()).findByRole('alert');

    await submit(user);

    await waitFor(() => expect(mockedCreateBooking).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).toMatch(UUID_V4);
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('removes the message, clears the form and calls onCreated once when the next submit succeeds', async () => {
    await within(form()).findByRole('alert');

    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument();
    expect(field('Room')).toHaveValue('');
    expect(field('Title')).toHaveValue('');
    expect(field('Organizer email')).toHaveValue('');
    expect(field('Start')).toHaveValue('');
    expect(field('End')).toHaveValue('');
  });
});
