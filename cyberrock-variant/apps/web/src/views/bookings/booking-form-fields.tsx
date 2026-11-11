import { ReactNode, useId } from 'react';
import { useFormContext } from 'react-hook-form';
import TextField from '@mui/material/TextField';
import type { CreateBookingFormValues } from './booking-form-schema';

type BookingFieldName = keyof CreateBookingFormValues;

type BookingFormFieldProps = {
  name: BookingFieldName;
  label: string;
  type?: string;
  revalidates?: BookingFieldName;
  children?: ReactNode;
};

export function BookingFormField({ name, label, type, revalidates, children }: BookingFormFieldProps) {
  const id = useId();
  const { register, formState } = useFormContext<CreateBookingFormValues>();
  const { ref, ...field } = register(name, { deps: revalidates });
  const error = formState.errors[name];

  return (
    <TextField
      id={id}
      label={label}
      type={type}
      select={Boolean(children)}
      SelectProps={{ native: true }}
      InputLabelProps={{ shrink: true }}
      inputRef={ref}
      error={Boolean(error)}
      helperText={error?.message}
      size="small"
      fullWidth
      {...field}
    >
      {children}
    </TextField>
  );
}

export function BookingScheduleFields() {
  return (
    <>
      <BookingFormField name="title" label="Title" />
      <BookingFormField name="startsAt" label="Start (UTC)" type="datetime-local" revalidates="endsAt" />
      <BookingFormField name="endsAt" label="End (UTC)" type="datetime-local" />
    </>
  );
}
