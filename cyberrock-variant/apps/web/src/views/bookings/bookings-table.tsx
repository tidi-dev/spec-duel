import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { formatUtc } from './utc-date-time';

const COLUMNS = ['Title', 'Room', 'Organizer', 'Start (UTC)', 'End (UTC)', 'Confirmation', 'Actions'];

type BookingsTableProps = {
  bookings: BookingDto[];
  rooms: RoomDto[];
  busy: boolean;
  onEdit: (booking: BookingDto) => void;
  onDelete: (booking: BookingDto) => void;
};

export function BookingsTable({ bookings, rooms, busy, onEdit, onDelete }: BookingsTableProps) {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));

  return (
    <TableContainer>
      <Table aria-label="Bookings">
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {bookings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} align="center">
                No bookings yet
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>{booking.title}</TableCell>
                <TableCell>{roomNames.get(booking.roomId) ?? booking.roomId}</TableCell>
                <TableCell>{booking.organizerEmail}</TableCell>
                <TableCell>{formatUtc(booking.startsAt)}</TableCell>
                <TableCell>{formatUtc(booking.endsAt)}</TableCell>
                <TableCell>{booking.confirmationStatus}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" disabled={busy} aria-label={`Edit ${booking.title}`} onClick={() => onEdit(booking)}>
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
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
