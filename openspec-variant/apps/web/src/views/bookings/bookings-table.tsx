import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { formatUtcDateTime } from './booking-time-format';

const COLUMN_COUNT = 7;

type BookingsTableProps = {
  bookings: BookingDto[];
  rooms: RoomDto[];
  onEdit: (booking: BookingDto) => void;
  onDelete: (booking: BookingDto) => void;
};

export function BookingsTable({ bookings, rooms, onEdit, onDelete }: BookingsTableProps) {
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));

  return (
    <TableContainer>
      <Table aria-label="Bookings">
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Room</TableCell>
            <TableCell>Organizer</TableCell>
            <TableCell>Start (UTC)</TableCell>
            <TableCell>End (UTC)</TableCell>
            <TableCell>Confirmation</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bookings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} align="center">
                No bookings found.
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>{booking.title}</TableCell>
                <TableCell>{roomNameById.get(booking.roomId) ?? booking.roomId}</TableCell>
                <TableCell>{booking.organizerEmail}</TableCell>
                <TableCell>{formatUtcDateTime(booking.startsAt)}</TableCell>
                <TableCell>{formatUtcDateTime(booking.endsAt)}</TableCell>
                <TableCell>{booking.confirmationStatus}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" aria-label={`Edit ${booking.title}`} onClick={() => onEdit(booking)}>
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    aria-label={`Delete ${booking.title}`}
                    onClick={() => onDelete(booking)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
