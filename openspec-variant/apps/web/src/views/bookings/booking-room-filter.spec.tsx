import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testRooms } from './booking-test-data';
import { BookingRoomFilter } from './booking-room-filter';

describe('BookingRoomFilter', () => {
  it('offers "All rooms" and every room name, with "All rooms" selected for an empty value', () => {
    render(<BookingRoomFilter rooms={testRooms} roomId="" onChange={jest.fn()} />);

    const filter = screen.getByLabelText('Filter by room');
    const options = within(filter).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['All rooms', ...testRooms.map((room) => room.name)]);
    expect(within(filter).getByRole<HTMLOptionElement>('option', { name: 'All rooms' }).selected).toBe(true);
  });

  it('shows the given room as selected', () => {
    render(<BookingRoomFilter rooms={testRooms} roomId={testRooms[2].id} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Filter by room')).toHaveValue(testRooms[2].id);
  });

  it('calls back with the chosen room id, and with an empty value for "All rooms"', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<BookingRoomFilter rooms={testRooms} roomId="" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Filter by room'), 'Room 03');
    await user.selectOptions(screen.getByLabelText('Filter by room'), 'All rooms');

    expect(onChange).toHaveBeenNthCalledWith(1, testRooms[2].id);
    expect(onChange).toHaveBeenNthCalledWith(2, '');
  });
});
