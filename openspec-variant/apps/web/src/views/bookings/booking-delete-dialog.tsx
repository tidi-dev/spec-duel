import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { BookingDto } from '@roombook/contract';

type BookingDeleteDialogProps = {
  booking: BookingDto;
  onConfirm: (booking: BookingDto) => void;
  onCancel: () => void;
};

export function BookingDeleteDialog({ booking, onConfirm, onCancel }: BookingDeleteDialogProps) {
  return (
    <Dialog open onClose={onCancel} aria-labelledby="booking-delete-title">
      <DialogTitle id="booking-delete-title">Delete booking?</DialogTitle>
      <DialogContent>
        <DialogContentText>The booking &quot;{booking.title}&quot; will be removed.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" onClick={() => onConfirm(booking)}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
