import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import Typography from '@mui/material/Typography';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@roombook/contract';
import type { BookingDto, PagedBookingsDto, RoomDto } from '@roombook/contract';
import { deleteBooking, listBookings } from '../../services/booking.service';
import { listRooms } from '../../services/room.service';
import { BookingCreateForm } from './booking-create-form';
import { BookingDeleteDialog } from './booking-delete-dialog';
import { BookingEditDialog } from './booking-edit-dialog';
import { BookingRoomFilter } from './booking-room-filter';
import { BookingsTable } from './bookings-table';

const ROWS_PER_PAGE_OPTIONS = [DEFAULT_PAGE_SIZE];

export function BookingsPage() {
  const [rooms, setRooms] = useState<RoomDto[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<PagedBookingsDto | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editedBooking, setEditedBooking] = useState<BookingDto | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<BookingDto | null>(null);

  useEffect(() => {
    let active = true;
    listRooms(1, MAX_PAGE_SIZE)
      .then((data) => active && setRooms(data.items))
      .catch((e: unknown) => active && setRoomsError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setBookingsLoading(true);
    setBookingsError(null);
    listBookings(pageIndex + 1, DEFAULT_PAGE_SIZE, roomId || undefined)
      .then((data) => active && setResult(data))
      .catch((e: unknown) => active && setBookingsError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setBookingsLoading(false));
    return () => {
      active = false;
    };
  }, [pageIndex, roomId, reloadCount]);

  const reload = () => setReloadCount((count) => count + 1);

  const handleRoomChange = (nextRoomId: string) => {
    setRoomId(nextRoomId);
    setPageIndex(0);
  };

  const handleSaved = () => {
    setEditedBooking(null);
    reload();
  };

  const handleDeleteConfirm = async (booking: BookingDto) => {
    setBookingToDelete(null);
    setDeleteError(null);
    try {
      await deleteBooking(booking.id);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (result?.items.length === 1 && pageIndex > 0) setPageIndex(pageIndex - 1);
    else reload();
  };

  const loadError = roomsError ?? bookingsError;
  const loading = bookingsLoading || (rooms === null && roomsError === null);

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Bookings
      </Typography>
      <Stack spacing={3}>
        <BookingCreateForm rooms={rooms ?? []} onCreated={reload} />
        <BookingRoomFilter rooms={rooms ?? []} roomId={roomId} onChange={handleRoomChange} />
        {loading && <LinearProgress aria-label="Loading bookings" />}
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
        {result && rooms && !loadError && (
          <Paper>
            <BookingsTable
              bookings={result.items}
              rooms={rooms}
              onEdit={setEditedBooking}
              onDelete={setBookingToDelete}
            />
            <TablePagination
              component="div"
              count={result.total}
              page={pageIndex}
              onPageChange={(_, nextPageIndex) => setPageIndex(nextPageIndex)}
              rowsPerPage={DEFAULT_PAGE_SIZE}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            />
          </Paper>
        )}
      </Stack>
      {editedBooking && (
        <BookingEditDialog booking={editedBooking} onSaved={handleSaved} onClose={() => setEditedBooking(null)} />
      )}
      {bookingToDelete && (
        <BookingDeleteDialog
          booking={bookingToDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setBookingToDelete(null)}
        />
      )}
    </>
  );
}
