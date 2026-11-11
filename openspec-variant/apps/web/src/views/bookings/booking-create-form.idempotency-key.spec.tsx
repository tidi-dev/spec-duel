import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { createBooking } from '../../services/booking.service';
import { fillForm, renderCreateForm, submit, UUID_PATTERN } from './booking-create-form-test-helpers';
import { buildTestBooking } from './booking-test-data';

jest.mock('../../services/booking.service', () => ({ createBooking: jest.fn() }));

const mockedCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;

const sentKey = (callIndex: number) => mockedCreateBooking.mock.calls[callIndex][1];

const setup = () => {
  const onCreated = jest.fn();
  return { user: renderCreateForm(onCreated), onCreated };
};

describe('BookingCreateForm idempotency key', () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedCreateBooking.mockResolvedValue(buildTestBooking(1));
  });

  it('reuses the same key when the unchanged form is sent again after a network error', async () => {
    mockedCreateBooking.mockRejectedValueOnce(new AxiosError('Network Error', AxiosError.ERR_NETWORK));
    const { user, onCreated } = setup();
    await fillForm(user);

    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network Error');
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking).toHaveBeenCalledTimes(2);
    expect(sentKey(1)).toBe(sentKey(0));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses a new key for the next booking after a successful create', async () => {
    const { user, onCreated } = setup();
    await fillForm(user);
    await submit(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    await fillForm(user);
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(sentKey(1)).toMatch(UUID_PATTERN);
    expect(sentKey(1)).not.toBe(sentKey(0));
  });

  it('uses a new key when a field changes after a failed create', async () => {
    mockedCreateBooking.mockRejectedValueOnce(new AxiosError('Network Error', AxiosError.ERR_NETWORK));
    const { user, onCreated } = setup();
    await fillForm(user);
    await submit(user);
    await screen.findByRole('alert');

    await user.type(screen.getByLabelText('Title'), ' v2');
    await submit(user);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mockedCreateBooking.mock.calls[1][0].title).toBe('Planning v2');
    expect(sentKey(1)).toMatch(UUID_PATTERN);
    expect(sentKey(1)).not.toBe(sentKey(0));
  });
});
