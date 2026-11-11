import { useState } from 'react';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import Typography from '@mui/material/Typography';
import { DEFAULT_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { deleteBooking } from '../../services/booking.service';
import { BookingsTable } from './bookings-table';
import { CreateBookingForm } from './create-booking-form';
import { EditBookingDialog } from './edit-booking-dialog';
import { errorMessage } from './error-message';
import { RoomFilter } from './room-filter';
import { useAllRooms } from './use-all-rooms';
import { useBookingsList } from './use-bookings-list';

const ROWS_PER_PAGE_OPTIONS = [DEFAULT_PAGE_SIZE];

export function BookingsPage() {
  const { rooms, error: roomsError } = useAllRooms();
  const { roomId, result, loading, error, goToPage, filterByRoom, refetch } = useBookingsList();
  const [editing, setEditing] = useState<BookingDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (booking: BookingDto) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBooking(booking.id);
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
    setDeleting(false);
    refetch();
  };

  const handleSaved = () => {
    setEditing(null);
    refetch();
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Bookings
      </Typography>
      {roomsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {roomsError}
        </Alert>
      )}
      <CreateBookingForm rooms={rooms} onCreated={refetch} />
      <RoomFilter rooms={rooms} roomId={roomId} onChange={filterByRoom} />
      {loading && <LinearProgress aria-label="Loading bookings" />}
      {error && <Alert severity="error">{error}</Alert>}
      {deleteError && <Alert severity="error">{deleteError}</Alert>}
      {result && !error && (
        <Paper>
          <BookingsTable
            bookings={result.items}
            rooms={rooms}
            busy={deleting}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
          <TablePagination
            component="div"
            count={result.total}
            page={result.page - 1}
            onPageChange={(_, nextPageIndex) => goToPage(nextPageIndex + 1)}
            rowsPerPage={DEFAULT_PAGE_SIZE}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </Paper>
      )}
      {editing && (
        <EditBookingDialog booking={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
