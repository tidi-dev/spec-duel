import { object, string } from 'yup';
import type { ObjectSchema } from 'yup';
import { BOOKING_TITLE_MAX_LENGTH } from '@roombook/contract';

export type EditBookingFormValues = {
  title: string;
  startsAt: string;
  endsAt: string;
};

export type CreateBookingFormValues = EditBookingFormValues & {
  roomId: string;
  organizerEmail: string;
};

const editFields = {
  title: string()
    .required('Title is required')
    .max(BOOKING_TITLE_MAX_LENGTH, `Title must be at most ${BOOKING_TITLE_MAX_LENGTH} characters`),
  startsAt: string().required('Start is required'),
  endsAt: string()
    .required('End is required')
    .test('after-start', 'End must be later than start', (endsAt, context) => {
      const { startsAt } = context.parent as EditBookingFormValues;
      return !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt);
    }),
};

export const editBookingFormSchema: ObjectSchema<EditBookingFormValues> = object(editFields);

export const createBookingFormSchema: ObjectSchema<CreateBookingFormValues> = object({
  roomId: string().required('Room is required'),
  organizerEmail: string().required('Organizer email is required').email('Organizer email must be a valid email'),
  ...editFields,
});
