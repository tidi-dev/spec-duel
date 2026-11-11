import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BOOKING_TITLE_MAX_LENGTH } from '@roombook/contract';
import type { CreateBookingDto, RoomDto } from '@roombook/contract';
import { createBooking } from '../../services/booking.service';
import { inputValueToIsoUtc, isEndAfterStart } from './booking-time-format';

const EMPTY_VALUES: CreateBookingDto = { roomId: '', title: '', organizerEmail: '', startsAt: '', endsAt: '' };
const SHRUNK_LABEL = { shrink: true };

type BookingCreateFormProps = {
  rooms: RoomDto[];
  onCreated: () => void;
};

export function BookingCreateForm({ rooms, onCreated }: BookingCreateFormProps) {
  const { register, handleSubmit, reset, watch, formState } = useForm<CreateBookingDto>({
    defaultValues: EMPTY_VALUES,
  });
  const { errors, isSubmitting } = formState;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const subscription = watch(() => {
      idempotencyKeyRef.current = null;
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const onSubmit = async (values: CreateBookingDto) => {
    setSubmitError(null);
    idempotencyKeyRef.current ??= uuidv4();
    try {
      await createBooking(
        { ...values, startsAt: inputValueToIsoUtc(values.startsAt), endsAt: inputValueToIsoUtc(values.endsAt) },
        idempotencyKeyRef.current,
      );
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
      return;
    }
    idempotencyKeyRef.current = null;
    reset();
    onCreated();
  };

  return (
    <Box component="form" aria-labelledby="booking-create-heading" noValidate onSubmit={handleSubmit(onSubmit)}>
      <Typography id="booking-create-heading" variant="h6" component="h2" gutterBottom>
        New booking
      </Typography>
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            id="booking-create-room"
            select
            fullWidth
            label="Room"
            SelectProps={{ native: true }}
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('roomId', { required: 'Room is required' })}
            error={Boolean(errors.roomId)}
            helperText={errors.roomId?.message}
          >
            <option value="">Choose a room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            id="booking-create-title"
            fullWidth
            label="Title"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={{ ...register('title', { required: 'Title is required' }), maxLength: BOOKING_TITLE_MAX_LENGTH }}
            error={Boolean(errors.title)}
            helperText={errors.title?.message}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            id="booking-create-organizer-email"
            fullWidth
            type="email"
            label="Organizer email"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('organizerEmail', { required: 'Organizer email is required' })}
            error={Boolean(errors.organizerEmail)}
            helperText={errors.organizerEmail?.message}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            id="booking-create-starts-at"
            fullWidth
            type="datetime-local"
            label="Start (UTC)"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('startsAt', { required: 'Start is required' })}
            error={Boolean(errors.startsAt)}
            helperText={errors.startsAt?.message}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            id="booking-create-ends-at"
            fullWidth
            type="datetime-local"
            label="End (UTC)"
            InputLabelProps={SHRUNK_LABEL}
            inputProps={register('endsAt', {
              required: 'End is required',
              validate: (endsAt, values) => isEndAfterStart(endsAt, values.startsAt) || 'End must be later than start',
            })}
            error={Boolean(errors.endsAt)}
            helperText={errors.endsAt?.message}
          />
        </Grid>
        <Grid item xs={12}>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            Create booking
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
