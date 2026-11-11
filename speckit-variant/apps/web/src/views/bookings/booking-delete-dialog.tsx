import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { BookingDto } from '@roombook/contract';
import { deleteBooking } from '../../services/booking.service';

type BookingDeleteDialogProps = {
  booking: BookingDto;
  onClose: () => void;
  onDeleted: () => void;
};

export function BookingDeleteDialog({ booking, onClose, onDeleted }: BookingDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    setDeleting(true);
    setErrorMessage(null);
    try {
      await deleteBooking(booking.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setDeleting(false);
      return;
    }
    onDeleted();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="delete-booking-title">
      <DialogTitle id="delete-booking-title">Delete booking</DialogTitle>
      <DialogContent>
        <DialogContentText>{`Delete the booking "${booking.title}"? This cannot be undone.`}</DialogContentText>
        {errorMessage && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={deleting} onClick={confirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
