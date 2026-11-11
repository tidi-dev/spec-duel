import { render, screen, within } from '@testing-library/react';
import type { RoomDto } from '@roombook/contract';
import { RoomsTable } from './rooms-table';

const rooms: RoomDto[] = [
  { id: '11111111-0000-4000-8000-000000000001', name: 'Room 01', capacity: 2 },
  { id: '11111111-0000-4000-8000-000000000002', name: 'Room 02', capacity: 4 },
];

describe('RoomsTable', () => {
  it('renders a row with name and capacity for each room', () => {
    render(<RoomsTable rooms={rooms} />);

    const table = screen.getByRole('table', { name: 'Rooms' });
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Capacity' })).toBeInTheDocument();
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[0]).getByText('Room 01')).toBeInTheDocument();
    expect(within(bodyRows[0]).getByText('2')).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText('Room 02')).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText('4')).toBeInTheDocument();
  });

  it('renders the empty state when there are no rooms', () => {
    render(<RoomsTable rooms={[]} />);

    expect(screen.getByText('No rooms found.')).toBeInTheDocument();
    expect(screen.queryByText('Room 01')).not.toBeInTheDocument();
  });
});
