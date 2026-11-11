import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { CreateBookingDto, RoomDto } from '@roombook/contract';
import { createBooking } from '../../services/booking.service';
import { BookingFormField, BookingScheduleFields } from './booking-form-fields';
import { createBookingSchema } from './booking-form-schema';
import type { CreateBookingFormValues } from './booking-form-schema';
import { errorMessage } from './error-message';
import { useIdempotencyKey } from './use-idempotency-key';
import { utcInputToIso } from './utc-date-time';

const EMPTY_VALUES: CreateBookingFormValues = { roomId: '', organizerEmail: '', title: '', startsAt: '', endsAt: '' };

type CreateBookingFormProps = {
  rooms: RoomDto[];
  onCreated: () => void;
};

export function CreateBookingForm({ rooms, onCreated }: CreateBookingFormProps) {
  const form = useForm<CreateBookingFormValues>({
    defaultValues: EMPTY_VALUES,
    resolver: yupResolver(createBookingSchema),
  });
  const { keyFor, settle } = useIdempotencyKey();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async (values: CreateBookingFormValues) => {
    const body: CreateBookingDto = {
      roomId: values.roomId,
      title: values.title,
      organizerEmail: values.organizerEmail,
      startsAt: utcInputToIso(values.startsAt),
      endsAt: utcInputToIso(values.endsAt),
    };
    setSubmitError(null);
    try {
      await createBooking(body, keyFor(body));
    } catch (error) {
      settle(error);
      setSubmitError(errorMessage(error));
      return;
    }
    settle();
    form.reset();
    onCreated();
  };

  return (
    <FormProvider {...form}>
      <Paper
        component="form"
        aria-label="New booking"
        noValidate
        onSubmit={form.handleSubmit(submit)}
        sx={{ p: 2, mb: 3 }}
      >
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            New booking
          </Typography>
          {submitError && <Alert severity="error">{submitError}</Alert>}
          <BookingFormField name="roomId" label="Room">
            <option value="">Select a room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </BookingFormField>
          <BookingFormField name="organizerEmail" label="Organizer email" type="email" />
          <BookingScheduleFields />
          <Button type="submit" variant="contained" disabled={form.formState.isSubmitting} sx={{ alignSelf: 'flex-start' }}>
            Create booking
          </Button>
        </Stack>
      </Paper>
    </FormProvider>
  );
}
