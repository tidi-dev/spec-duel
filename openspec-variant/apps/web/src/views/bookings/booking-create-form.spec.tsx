import { screen, waitFor } from '@testing-library/react';
import { ErrorCodeEnum } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking } from '../../services/booking.service';
import { fillForm, renderCreateForm, setTime, submit, UUID_PATTERN } from './booking-create-form-test-helpers';
import { buildTestBooking, testRooms } from './booking-test-data';

jest.mock('../../services/booking.service', () => ({ createBooking: jest.fn() }));

const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;

const OVERLAP_MESSAGE = 'The room already has a booking that overlaps this time span';

const overlapError = () =>
  new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: OVERLAP_MESSAGE });

const sentKey = (callIndex: number) => mockedCreateBooking.mock.calls[callIndex][1];

const setup = () => {
  const onCreated = jest.fn();
  return { user: renderCreateForm(onCreated), onCreated };
};

describe('BookingCreateForm', () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(buildTestBooking(1));
  });

  it('sends one create request with times in ISO UTC and a UUID key, then clears the form', async () => {
    const { user, onCreated } = setup();
    await fillForm(user);

    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockedCreateBooking.mock.calls[0][0]).toEqual({
      roomId: testRooms[2].id,
      title: 'Planning',
      organizerEmail: 'ann@example.com',
      startsAt: '2030-01-01T09:30:00.000Z',
      endsAt: '2030-01-01T10:30:00.000Z',
    });
    expect(sentKey(0)).toMatch(UUID_PATTERN);
    expect(screen.getByLabelText('Room')).toHaveValue('');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Organizer email')).toHaveValue('');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('');
    expect(screen.getByLabelText('End (UTC)')).toHaveValue('');
  });

  it('sends nothing and marks the title when it is empty', async () => {
    const { user, onCreated } = setup();
    await fillForm(user);
    await user.clear(screen.getByLabelText('Title'));

    await submit(user);

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInvalid();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it.each([
    ['equal to', '2030-01-01T09:30'],
    ['earlier than', '2030-01-01T09:00'],
  ])('sends nothing and marks the end when it is %s the start', async (_, endValue) => {
    const { user } = setup();
    await fillForm(user);
    setTime('End (UTC)', endValue);

    await submit(user);

    expect(await screen.findByText('End must be later than start')).toBeInTheDocument();
    expect(screen.getByLabelText('End (UTC)')).toBeInvalid();
    expect(mockedCreateBooking).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is pending', async () => {
    let resolveCreate: () => void = () => undefined;
    mockedCreateBooking.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = () => resolve(buildTestBooking(1));
      }),
    );
    const { user } = setup();
    await fillForm(user);

    await submit(user);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create booking' })).toBeDisabled());
    resolveCreate();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create booking' })).toBeEnabled());
  });

  it('shows the API message and keeps the entered values when the create fails', async () => {
    mockedCreateBooking.mockRejectedValue(
      new ApiError({ statusCode: 404, errorCode: ErrorCodeEnum.ROOM_NOT_FOUND, message: 'Room 123 was not found' }),
    );
    const { user, onCreated } = setup();
    await fillForm(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Room 123 was not found');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Room')).toHaveValue(testRooms[2].id);
    expect(screen.getByLabelText('Title')).toHaveValue('Planning');
    expect(screen.getByLabelText('Organizer email')).toHaveValue('ann@example.com');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('2030-01-01T09:30');
    expect(screen.getByLabelText('End (UTC)')).toHaveValue('2030-01-01T10:30');
  });

  it('shows the overlap message in the form and keeps all five values when the create is rejected', async () => {
    mockedCreateBooking.mockRejectedValue(overlapError());
    const { user, onCreated } = setup();
    await fillForm(user);

    await submit(user);

    const form = screen.getByRole('form', { name: 'New booking' });
    await waitFor(() => expect(form).toContainElement(screen.getByRole('alert')));
    expect(screen.getByRole('alert')).toHaveTextContent(OVERLAP_MESSAGE);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Room')).toHaveValue(testRooms[2].id);
    expect(screen.getByLabelText('Title')).toHaveValue('Planning');
    expect(screen.getByLabelText('Organizer email')).toHaveValue('ann@example.com');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('2030-01-01T09:30');
    expect(screen.getByLabelText('End (UTC)')).toHaveValue('2030-01-01T10:30');
  });

  it('sends the corrected span with a new key after an overlap rejection, then clears the form', async () => {
    mockedCreateBooking.mockRejectedValueOnce(overlapError());
    const { user, onCreated } = setup();
    await fillForm(user);
    await submit(user);
    await screen.findByRole('alert');

    setTime('Start (UTC)', '2030-01-01T11:00');
    setTime('End (UTC)', '2030-01-01T12:00');
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockedCreateBooking).toHaveBeenCalledTimes(2);
    expect(mockedCreateBooking.mock.calls[1][0]).toEqual({
      roomId: testRooms[2].id,
      title: 'Planning',
      organizerEmail: 'ann@example.com',
      startsAt: '2030-01-01T11:00:00.000Z',
      endsAt: '2030-01-01T12:00:00.000Z',
    });
    expect(sentKey(1)).toMatch(UUID_PATTERN);
    expect(sentKey(1)).not.toBe(sentKey(0));
    ['Room', 'Title', 'Organizer email', 'Start (UTC)', 'End (UTC)'].forEach((label) =>
      expect(screen.getByLabelText(label)).toHaveValue(''),
    );
  });
});
