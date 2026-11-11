import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { BookingDto } from '@roombook/contract';
import { updateBooking } from '../../services/booking.service';
import { toLocalInputValue, toUtcIso } from './booking-date.util';
import { editBookingFormSchema } from './booking-form.schema';
import type { EditBookingFormValues } from './booking-form.schema';

const SHRUNK_LABEL = { shrink: true };

type BookingEditDialogProps = {
  booking: BookingDto;
  onClose: () => void;
  onSaved: () => void;
};

export function BookingEditDialog({ booking, onClose, onSaved }: BookingEditDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditBookingFormValues>({
    resolver: yupResolver(editBookingFormSchema),
    defaultValues: {
      title: booking.title,
      startsAt: toLocalInputValue(booking.startsAt),
      endsAt: toLocalInputValue(booking.endsAt),
    },
  });

  const save = async ({ title, startsAt, endsAt }: EditBookingFormValues): Promise<void> => {
    setErrorMessage(null);
    try {
      await updateBooking(booking.id, { title, startsAt: toUtcIso(startsAt), endsAt: toUtcIso(endsAt) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    onSaved();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="edit-booking-title">
      <form noValidate onSubmit={handleSubmit(save)}>
        <DialogTitle id="edit-booking-title">Edit booking</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Title"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={register('title')}
              error={Boolean(errors.title)}
              helperText={errors.title?.message}
            />
            <TextField
              fullWidth
              type="datetime-local"
              label="Start"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={register('startsAt')}
              error={Boolean(errors.startsAt)}
              helperText={errors.startsAt?.message}
            />
            <TextField
              fullWidth
              type="datetime-local"
              label="End"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={register('endsAt')}
              error={Boolean(errors.endsAt)}
              helperText={errors.endsAt?.message}
            />
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
