import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingCreateForm } from './booking-create-form';
import { testRooms } from './booking-test-data';

type TestUser = ReturnType<typeof userEvent.setup>;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

export const fillForm = async (user: TestUser) => {
  await user.selectOptions(screen.getByLabelText('Room'), 'Room 03');
  await user.type(screen.getByLabelText('Title'), 'Planning');
  await user.type(screen.getByLabelText('Organizer email'), 'ann@example.com');
  setTime('Start (UTC)', '2030-01-01T09:30');
  setTime('End (UTC)', '2030-01-01T10:30');
};

export const submit = (user: TestUser) => user.click(screen.getByRole('button', { name: 'Create booking' }));

export const renderCreateForm = (onCreated: () => void): TestUser => {
  const user = userEvent.setup();
  render(<BookingCreateForm rooms={testRooms} onCreated={onCreated} />);
  return user;
};
