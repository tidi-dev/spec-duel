import { useId, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import type { BookingDto, UpdateBookingDto } from '@roombook/contract';
import { updateBooking } from '../../services/booking.service';
import { BookingScheduleFields } from './booking-form-fields';
import { editBookingSchema } from './booking-form-schema';
import type { BookingFormContext, EditBookingFormValues } from './booking-form-schema';
import { errorMessage } from './error-message';
import { isoToUtcInput, utcInputToIso } from './utc-date-time';

const toFormValues = (booking: BookingDto): EditBookingFormValues => ({
  title: booking.title,
  startsAt: isoToUtcInput(booking.startsAt),
  endsAt: isoToUtcInput(booking.endsAt),
});

const changedFields = (shown: EditBookingFormValues, entered: EditBookingFormValues): UpdateBookingDto => ({
  ...(entered.title !== shown.title && { title: entered.title }),
  ...(entered.startsAt !== shown.startsAt && { startsAt: utcInputToIso(entered.startsAt) }),
  ...(entered.endsAt !== shown.endsAt && { endsAt: utcInputToIso(entered.endsAt) }),
});

type EditBookingDialogProps = {
  booking: BookingDto;
  onClose: () => void;
  onSaved: () => void;
};

export function EditBookingDialog({ booking, onClose, onSaved }: EditBookingDialogProps) {
  const titleId = useId();
  const shown = toFormValues(booking);
  const form = useForm<EditBookingFormValues, BookingFormContext>({
    defaultValues: shown,
    resolver: yupResolver(editBookingSchema),
    context: { storedSpan: { startsAt: shown.startsAt, endsAt: shown.endsAt } },
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (entered: EditBookingFormValues) => {
    const changes = changedFields(shown, entered);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaveError(null);
    try {
      await updateBooking(booking.id, changes);
    } catch (error) {
      setSaveError(errorMessage(error));
      return;
    }
    onSaved();
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <FormProvider {...form}>
        <form noValidate onSubmit={form.handleSubmit(save)}>
          <DialogTitle id={titleId}>Edit booking</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <BookingScheduleFields />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
              Save
            </Button>
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
}
