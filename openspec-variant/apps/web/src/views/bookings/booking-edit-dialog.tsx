import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { BOOKING_TITLE_MAX_LENGTH } from '@roombook/contract';
import type { BookingDto } from '@roombook/contract';
import { updateBooking } from '../../services/booking.service';
import { inputValueToIsoUtc, isEndAfterStart, isoToInputValue } from './booking-time-format';

const SHRUNK_LABEL = { shrink: true };

type BookingEditFormValues = Pick<BookingDto, 'title' | 'startsAt' | 'endsAt'>;

type BookingEditDialogProps = {
  booking: BookingDto;
  onSaved: () => void;
  onClose: () => void;
};

export function BookingEditDialog({ booking, onSaved, onClose }: BookingEditDialogProps) {
  const { register, handleSubmit, formState } = useForm<BookingEditFormValues>({
    defaultValues: {
      title: booking.title,
      startsAt: isoToInputValue(booking.startsAt),
      endsAt: isoToInputValue(booking.endsAt),
    },
  });
  const { errors, isSubmitting } = formState;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (values: BookingEditFormValues) => {
    setSubmitError(null);
    try {
      await updateBooking(booking.id, {
        title: values.title,
        startsAt: inputValueToIsoUtc(values.startsAt),
        endsAt: inputValueToIsoUtc(values.endsAt),
      });
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
      return;
    }
    onSaved();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="booking-edit-title">
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle id="booking-edit-title">Edit booking</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && <Alert severity="error">{submitError}</Alert>}
            <TextField
              id="booking-edit-title-field"
              fullWidth
              label="Title"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={{
                ...register('title', { required: 'Title is required' }),
                maxLength: BOOKING_TITLE_MAX_LENGTH,
              }}
              error={Boolean(errors.title)}
              helperText={errors.title?.message}
            />
            <TextField
              id="booking-edit-starts-at"
              fullWidth
              type="datetime-local"
              label="Start (UTC)"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={register('startsAt', { required: 'Start is required' })}
              error={Boolean(errors.startsAt)}
              helperText={errors.startsAt?.message}
            />
            <TextField
              id="booking-edit-ends-at"
              fullWidth
              type="datetime-local"
              label="End (UTC)"
              InputLabelProps={SHRUNK_LABEL}
              inputProps={register('endsAt', {
                required: 'End is required',
                validate: (endsAt, values) =>
                  isEndAfterStart(endsAt, values.startsAt) || 'End must be later than start',
              })}
              error={Boolean(errors.endsAt)}
              helperText={errors.endsAt?.message}
            />
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
