import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { RoomDto } from '@roombook/contract';

type RoomsTableProps = {
  rooms: RoomDto[];
};

export function RoomsTable({ rooms }: RoomsTableProps) {
  return (
    <TableContainer>
      <Table aria-label="Rooms">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="right">Capacity</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rooms.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} align="center">
                No rooms found.
              </TableCell>
            </TableRow>
          ) : (
            rooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell>{room.name}</TableCell>
                <TableCell align="right">{room.capacity}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
