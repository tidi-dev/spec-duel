import { object, ref, string } from 'yup';
import type { InferType } from 'yup';
import { BOOKING_TITLE_MAX_LENGTH } from '@roombook/contract';
import { parseUtcInput } from './utc-date-time';

export const END_NOT_AFTER_START_MESSAGE = 'End must be later than start';

type StoredSpan = { startsAt: string; endsAt: string };

export type BookingFormContext = { storedSpan?: StoredSpan };

const startsAtRef =ref<string>('startsAt');

export const editBookingSchema = object({
  title: string()
    .required('Title is required')
    .max(BOOKING_TITLE_MAX_LENGTH, `Title must be at most ${BOOKING_TITLE_MAX_LENGTH} characters`),
  startsAt: string().required('Start is required'),
  endsAt: string()
    .required('End is required')
    .test('later-than-start', END_NOT_AFTER_START_MESSAGE, (endsAt, context) => {
      const startsAt = context.resolve(startsAtRef);
      if (!endsAt || !startsAt) {
        return true;
      }
      // A stored span shorter than a minute shows the same minute on both sides.
      const stored = (context.options.context as BookingFormContext | undefined)?.storedSpan;
      const untouched = stored?.startsAt === startsAt && stored?.endsAt === endsAt;
      return untouched || parseUtcInput(endsAt) > parseUtcInput(startsAt);
    }),
});

export const createBookingSchema = editBookingSchema.concat(
  object({
    roomId: string().required('Room is required'),
    organizerEmail: string().required('Organizer email is required').email('Enter a valid email address'),
  }),
);

export type EditBookingFormValues = InferType<typeof editBookingSchema>;
export type CreateBookingFormValues = InferType<typeof createBookingSchema>;
