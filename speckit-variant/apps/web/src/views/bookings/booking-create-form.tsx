import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { RoomDto } from '@roombook/contract';
import { ApiError } from '../../services/api-error';
import { createBooking } from '../../services/booking.service';
import { toUtcIso } from './booking-date.util';
import { createBookingFormSchema } from './booking-form.schema';
import type { CreateBookingFormValues } from './booking-form.schema';
import { useIdempotencyKey } from './use-idempotency-key';

const EMPTY_FORM: CreateBookingFormValues = { roomId: '', title: '', organizerEmail: '', startsAt: '', endsAt: '' };
const SHRUNK_LABEL = { shrink: true };

type BookingCreateFormProps = {
  rooms: RoomDto[];
  onCreated: () => void;
};

export function BookingCreateForm({ rooms, onCreated }: BookingCreateFormProps) {
  const { getKey, release } = useIdempotencyKey();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBookingFormValues>({ resolver: yupResolver(createBookingFormSchema), defaultValues: EMPTY_FORM });

  const submit = async ({ startsAt, endsAt, ...booking }: CreateBookingFormValues): Promise<void> => {
    setErrorMessage(null);
    try {
      await createBooking({ ...booking, startsAt: toUtcIso(startsAt), endsAt: toUtcIso(endsAt) }, getKey());
    } catch (error) {
      if (error instanceof ApiError) release();
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    release();
    reset();
    onCreated();
  };

  return (
    <Paper
      component="form"
      aria-labelledby="new-booking-heading"
      noValidate
      onSubmit={handleSubmit(submit)}
      onChange={release}
      sx={{ p: 2, mb: 3 }}
    >
      <Typography id="new-booking-heading" variant="h6" component="h2" gutterBottom>
        New booking
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Room"
            SelectProps={{ native: true }}
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('roomId')}
            error={Boolean(errors.roomId)}
            helperText={errors.roomId?.message}
          >
            <option value="">Select a room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Title"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('title')}
            error={Boolean(errors.title)}
            helperText={errors.title?.message}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            type="email"
            label="Organizer email"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('organizerEmail')}
            error={Boolean(errors.organizerEmail)}
            helperText={errors.organizerEmail?.message}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="datetime-local"
            label="Start"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('startsAt')}
            error={Boolean(errors.startsAt)}
            helperText={errors.startsAt?.message}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="datetime-local"
            label="End"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('endsAt')}
            error={Boolean(errors.endsAt)}
            helperText={errors.endsAt?.message}
          />
        </Grid>
        {errorMessage && (
          <Grid item xs={12}>
            <Alert severity="error">{errorMessage}</Alert>
          </Grid>
        )}
        <Grid item xs={12}>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            Create booking
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );
}
