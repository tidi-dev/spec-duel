import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { MAX_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, RoomDto } from '@roombook/contract';
import { listRooms } from '../../services/room.service';
import { BookingCreateForm } from './booking-create-form';
import { BookingDeleteDialog } from './booking-delete-dialog';
import { BookingEditDialog } from './booking-edit-dialog';
import { BookingRoomFilter } from './booking-room-filter';
import { BookingsTable } from './bookings-table';
import { useBookings } from './use-bookings';

export function BookingsPage() {
  const { bookings, total, loading, errorMessage, page, roomId, setPage, setRoomId, reload } = useBookings();
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [roomsErrorMessage, setRoomsErrorMessage] = useState<string | null>(null);
  const [editedBooking, setEditedBooking] = useState<BookingDto | null>(null);
  const [deletedBooking, setDeletedBooking] = useState<BookingDto | null>(null);

  useEffect(() => {
    let active = true;
    listRooms(1, MAX_PAGE_SIZE)
      .then((data) => active && setRooms(data.items))
      .catch((e: unknown) => active && setRoomsErrorMessage(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, []);

  const handleSaved = (): void => {
    setEditedBooking(null);
    reload();
  };

  const handleDeleted = (): void => {
    setDeletedBooking(null);
    reload();
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Bookings
      </Typography>
      {roomsErrorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {roomsErrorMessage}
        </Alert>
      )}
      <BookingCreateForm rooms={rooms} onCreated={reload} />
      <Box sx={{ mb: 2 }}>
        <BookingRoomFilter rooms={rooms} roomId={roomId} onChange={setRoomId} />
      </Box>
      {loading && <LinearProgress aria-label="Loading bookings" />}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
      {!loading && !errorMessage && bookings.length === 0 && <Typography>No bookings found.</Typography>}
      {bookings.length > 0 && (
        <Paper>
          <BookingsTable
            bookings={bookings}
            rooms={rooms}
            total={total}
            page={page}
            onPageChange={setPage}
            onEdit={setEditedBooking}
            onDelete={setDeletedBooking}
          />
        </Paper>
      )}
      {editedBooking && (
        <BookingEditDialog booking={editedBooking} onClose={() => setEditedBooking(null)} onSaved={handleSaved} />
      )}
      {deletedBooking && (
        <BookingDeleteDialog
          booking={deletedBooking}
          onClose={() => setDeletedBooking(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
