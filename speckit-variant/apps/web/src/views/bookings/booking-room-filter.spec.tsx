import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoomDto } from '@roombook/contract';
import { BookingRoomFilter } from './booking-room-filter';

const rooms: RoomDto[] = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'Room 02', capacity: 4 },
];

describe('BookingRoomFilter', () => {
  it('renders a combobox named Room with All rooms plus one option per room', () => {
    render(<BookingRoomFilter rooms={rooms} onChange={jest.fn()} />);

    const filter = screen.getByRole('combobox', { name: 'Room' });
    const options = within(filter).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['All rooms', 'Room 01', 'Room 02']);
    expect(within(filter).getByRole<HTMLOptionElement>('option', { name: 'All rooms' }).selected).toBe(true);
  });

  it('shows the chosen room as selected', () => {
    render(<BookingRoomFilter rooms={rooms} roomId={rooms[1].id} onChange={jest.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveValue(rooms[1].id);
  });

  it('calls onChange with the id of the chosen room', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<BookingRoomFilter rooms={rooms} onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Room' }), 'Room 02');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(rooms[1].id);
  });

  it('calls onChange with no room when All rooms is chosen', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<BookingRoomFilter rooms={rooms} roomId={rooms[0].id} onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Room' }), 'All rooms');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
