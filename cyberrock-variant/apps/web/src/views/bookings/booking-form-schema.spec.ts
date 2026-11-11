import { ValidationError } from 'yup';
import type { AnyObjectSchema } from 'yup';
import { END_NOT_AFTER_START_MESSAGE, createBookingSchema, editBookingSchema } from './booking-form-schema';

const editValues = { title: 'Sprint planning', startsAt: '2030-01-07T09:00', endsAt: '2030-01-07T10:00' };
const createValues = {
  ...editValues,
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  organizerEmail: 'ann@example.com',
};

const errorsOf = async (schema: AnyObjectSchema, values: Record<string, string>): Promise<Record<string, string>> => {
  try {
    await schema.validate(values, { abortEarly: false });
    return {};
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return Object.fromEntries(error.inner.map((issue) => [issue.path ?? '', issue.message]));
  }
};

describe.each([
  ['create', createBookingSchema, createValues],
  ['edit', editBookingSchema, editValues],
])('booking form schema, %s shape', (_, schema, valid) => {
  it('accepts valid values', async () => {
    expect(await errorsOf(schema, valid)).toEqual({});
  });

  it('rejects an end equal to the start', async () => {
    expect(await errorsOf(schema, { ...valid, endsAt: valid.startsAt })).toEqual({
      endsAt: END_NOT_AFTER_START_MESSAGE,
    });
  });

  it('rejects an end earlier than the start', async () => {
    expect(await errorsOf(schema, { ...valid, endsAt: '2030-01-07T08:59' })).toEqual({
      endsAt: END_NOT_AFTER_START_MESSAGE,
    });
  });

  it('requires title, start and end', async () => {
    const errors = await errorsOf(schema, { ...valid, title: '', startsAt: '', endsAt: '' });

    expect(errors).toMatchObject({
      title: 'Title is required',
      startsAt: 'Start is required',
      endsAt: 'End is required',
    });
  });

  it('accepts a title of 120 characters and rejects 121', async () => {
    expect(await errorsOf(schema, { ...valid, title: 'a'.repeat(120) })).toEqual({});
    expect(await errorsOf(schema, { ...valid, title: 'a'.repeat(121) })).toEqual({
      title: 'Title must be at most 120 characters',
    });
  });
});

describe('booking form schema, stored span of an edited booking', () => {
  const sameMinute = { ...editValues, startsAt: '2030-01-07T10:00', endsAt: '2030-01-07T10:00' };
  const validate = (values: Record<string, string>) =>
    editBookingSchema.isValid(values, { context: { storedSpan: { startsAt: '2030-01-07T10:00', endsAt: '2030-01-07T10:00' } } });

  it('accepts the stored start and end when neither was changed', async () => {
    expect(await validate(sameMinute)).toBe(true);
  });

  it('still rejects an end that was changed to a value not later than the start', async () => {
    expect(await validate({ ...sameMinute, startsAt: '2030-01-07T09:00', endsAt: '2030-01-07T09:00' })).toBe(false);
  });
});

describe('booking form schema, create-only fields', () => {
  it('requires a room and an organizer email', async () => {
    expect(await errorsOf(createBookingSchema, { ...createValues, roomId: '', organizerEmail: '' })).toEqual({
      roomId: 'Room is required',
      organizerEmail: 'Organizer email is required',
    });
  });

  it('rejects an organizer email that is not an email address', async () => {
    expect(await errorsOf(createBookingSchema, { ...createValues, organizerEmail: 'x' })).toEqual({
      organizerEmail: 'Enter a valid email address',
    });
  });
});
