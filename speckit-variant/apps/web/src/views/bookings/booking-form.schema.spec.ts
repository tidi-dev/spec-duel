import { BOOKING_TITLE_MAX_LENGTH } from '@roombook/contract';
import type { ObjectSchema, ValidationError } from 'yup';
import { createBookingFormSchema, editBookingFormSchema } from './booking-form.schema';
import type { CreateBookingFormValues, EditBookingFormValues } from './booking-form.schema';

const validEdit: EditBookingFormValues = {
  title: 'Planning',
  startsAt: '2030-01-07T09:00',
  endsAt: '2030-01-07T10:00',
};

const validCreate: CreateBookingFormValues = {
  ...validEdit,
  roomId: 'a1b2c3d4-0000-4000-8000-000000000001',
  organizerEmail: 'ann@example.com',
};

const invalidPaths = <T extends EditBookingFormValues>(schema: ObjectSchema<T>, values: T): Promise<string[]> =>
  schema.validate(values, { abortEarly: false }).then(
    () => [],
    (error: ValidationError) => error.inner.map((inner) => inner.path ?? ''),
  );

describe('createBookingFormSchema', () => {
  it('accepts a valid form', async () => {
    expect(await invalidPaths(createBookingFormSchema, validCreate)).toEqual([]);
  });

  it('accepts a title of exactly the maximum length', async () => {
    const title = 'a'.repeat(BOOKING_TITLE_MAX_LENGTH);

    expect(await invalidPaths(createBookingFormSchema, { ...validCreate, title })).toEqual([]);
  });

  it.each<[string, Partial<CreateBookingFormValues>, string]>([
    ['a missing room', { roomId: '' }, 'roomId'],
    ['an empty title', { title: '' }, 'title'],
    ['a title longer than the maximum', { title: 'a'.repeat(BOOKING_TITLE_MAX_LENGTH + 1) }, 'title'],
    ['an invalid email', { organizerEmail: 'not-an-email' }, 'organizerEmail'],
    ['a missing email', { organizerEmail: '' }, 'organizerEmail'],
    ['a missing start', { startsAt: '' }, 'startsAt'],
    ['a missing end', { endsAt: '' }, 'endsAt'],
    ['an end equal to the start', { endsAt: validCreate.startsAt }, 'endsAt'],
    ['an end earlier than the start', { endsAt: '2030-01-07T08:59' }, 'endsAt'],
  ])('rejects %s', async (_, override, path) => {
    expect(await invalidPaths(createBookingFormSchema, { ...validCreate, ...override })).toEqual([path]);
  });
});

describe('editBookingFormSchema', () => {
  it('accepts a valid form of title, start and end only', async () => {
    expect(await invalidPaths(editBookingFormSchema, validEdit)).toEqual([]);
  });

  it.each<[string, Partial<EditBookingFormValues>, string]>([
    ['an empty title', { title: '' }, 'title'],
    ['a title longer than the maximum', { title: 'a'.repeat(BOOKING_TITLE_MAX_LENGTH + 1) }, 'title'],
    ['a missing start', { startsAt: '' }, 'startsAt'],
    ['a missing end', { endsAt: '' }, 'endsAt'],
    ['an end equal to the start', { endsAt: validEdit.startsAt }, 'endsAt'],
    ['an end earlier than the start', { endsAt: '2030-01-06T10:00' }, 'endsAt'],
  ])('rejects %s', async (_, override, path) => {
    expect(await invalidPaths(editBookingFormSchema, { ...validEdit, ...override })).toEqual([path]);
  });
});
