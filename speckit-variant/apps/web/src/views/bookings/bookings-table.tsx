import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { formatDateTime } from './booking-date.util';

const ROWS_PER_PAGE_OPTIONS = [DEFAULT_PAGE_SIZE];

type BookingsTableProps = {
  bookings: BookingDto[];
  rooms: RoomDto[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onEdit: (booking: BookingDto) => void;
  onDelete: (booking: BookingDto) => void;
};

export function BookingsTable({ bookings, rooms, total, page, onPageChange, onEdit, onDelete }: BookingsTableProps) {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));

  return (
    <>
      <TableContainer>
        <Table aria-label="Bookings">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Organizer</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell>Confirmation</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>{booking.title}</TableCell>
                <TableCell>{roomNames.get(booking.roomId) ?? booking.roomId}</TableCell>
                <TableCell>{booking.organizerEmail}</TableCell>
                <TableCell>{formatDateTime(booking.startsAt)}</TableCell>
                <TableCell>{formatDateTime(booking.endsAt)}</TableCell>
                <TableCell>{booking.confirmationStatus}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page - 1}
        onPageChange={(_, pageIndex) => onPageChange(pageIndex + 1)}
        rowsPerPage={DEFAULT_PAGE_SIZE}
        rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
      />
    </>
  );
}
