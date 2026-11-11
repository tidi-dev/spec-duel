import { RpcException } from '@nestjs/microservices';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, CreateBookingDto, ErrorCodeEnum, UpdateBookingDto } from '@roombook/contract';
import { mergeBookingChanges, normaliseCreateBooking, parseBookingChanges } from './booking-input';

const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';

const body = (overrides: Partial<CreateBookingDto> = {}): CreateBookingDto => ({
  roomId: ROOM_ID,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  ...overrides,
});

const stored = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99',
    roomId: ROOM_ID,
    title: 'Sprint planning',
    organizerEmail: 'ann@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  });

const withNull = (field: keyof UpdateBookingDto): UpdateBookingDto =>
  ({ [field]: null }) as unknown as UpdateBookingDto;

const expectValidationError = (run: () => unknown): void => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RpcException);
  expect((caught as RpcException).getError()).toEqual(
    expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
  );
};

const update = (changes: UpdateBookingDto): unknown => mergeBookingChanges(stored(), parseBookingChanges(changes));

describe('normaliseCreateBooking', () => {
  it('parses the instants and keeps the other fields', () => {
    expect(normaliseCreateBooking(body())).toEqual({
      roomId: ROOM_ID,
      title: 'Sprint planning',
      organizerEmail: 'ann@example.com',
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T10:00:00.000Z'),
    });
  });

  it('reads an offset form as its instant and lower-cases the room id (BKG-001, IDM-004)', () => {
    const normalised = normaliseCreateBooking(
      body({ roomId: ROOM_ID.toUpperCase(), startsAt: '2030-01-07T16:00:00+07:00' }),
    );

    expect(normalised.startsAt.toISOString()).toBe('2030-01-07T09:00:00.000Z');
    expect(normalised.roomId).toBe(ROOM_ID);
  });

  it.each(['2030-01-07T09:00', '2030-01-07T09:00:00', '2030-01-07', '2030-W02-1T09:00:00Z', '2030-007T09:00:00Z'])(
    'rejects the instant %s on either side (BKG-003)',
    (instant) => {
      expectValidationError(() => normaliseCreateBooking(body({ startsAt: instant })));
      expectValidationError(() => normaliseCreateBooking(body({ endsAt: instant })));
    },
  );
});

describe('parseBookingChanges', () => {
  it.each(['title', 'startsAt', 'endsAt'] as const)('rejects an explicit null for %s (BKG-008, R-01)', (field) => {
    expectValidationError(() => parseBookingChanges(withNull(field)));
  });

  it('keeps only the supplied fields, instants parsed', () => {
    expect(parseBookingChanges({})).toEqual({});
    expect(parseBookingChanges({ title: 'Retro' })).toEqual({ title: 'Retro' });
    expect(parseBookingChanges({ startsAt: '2030-01-07T16:30:00+07:00' })).toEqual({
      startsAt: new Date('2030-01-07T09:30:00.000Z'),
    });
    expect(parseBookingChanges({ endsAt: '2030-01-07T11:00:00Z' })).toEqual({
      endsAt: new Date('2030-01-07T11:00:00.000Z'),
    });
  });

  it('ignores fields an update cannot change (BKG-008)', () => {
    const changes = { roomId: ROOM_ID, organizerEmail: 'x@example.com' } as unknown as UpdateBookingDto;

    expect(parseBookingChanges(changes)).toEqual({});
  });

  it.each(['2030-01-07T09:00', '2030-01-07', '2030-01-07T09:00:00.123456Z', '2030-01-07t09:00:00z'])(
    'rejects the instant %s on either side (BKG-003)',
    (instant) => {
      expectValidationError(() => parseBookingChanges({ startsAt: instant }));
      expectValidationError(() => parseBookingChanges({ endsAt: instant }));
    },
  );
});

describe('title with a NUL character (BKG-002, BKG-008)', () => {
  it('is rejected on create and on update, because Postgres text cannot store it', () => {
    expectValidationError(() => normaliseCreateBooking(body({ title: 'a\u0000b' })));
    expectValidationError(() => parseBookingChanges({ title: 'a\u0000b' }));
  });
});

describe('mergeBookingChanges', () => {
  it('returns only the values that differ from the stored booking', () => {
    expect(update({ title: 'Retro' })).toEqual({ title: 'Retro' });
    expect(update({ endsAt: '2030-01-07T11:00:00Z' })).toEqual({ endsAt: new Date('2030-01-07T11:00:00.000Z') });
    expect(update({ startsAt: '2030-01-07T09:30:00Z' })).toEqual({ startsAt: new Date('2030-01-07T09:30:00.000Z') });
  });

  it('returns nothing when no value changes (BKG-008)', () => {
    expect(update({})).toEqual({});
    expect(
      update({ title: 'Sprint planning', startsAt: '2030-01-07T16:00:00+07:00', endsAt: '2030-01-07T10:00:00Z' }),
    ).toEqual({});
  });

  it('accepts a move of both sides that would be invalid against the stored ones', () => {
    expect(update({ startsAt: '2030-01-08T09:00:00Z', endsAt: '2030-01-08T10:00:00Z' })).toEqual({
      startsAt: new Date('2030-01-08T09:00:00.000Z'),
      endsAt: new Date('2030-01-08T10:00:00.000Z'),
    });
  });
});

describe('span rule through create and update (BKG-004, R-11)', () => {
  it.each([
    ['equal', '2030-01-07T09:00:00.000Z', '2030-01-07T09:00:00.000Z'],
    ['one millisecond earlier', '2030-01-07T09:00:00.000Z', '2030-01-07T08:59:59.999Z'],
    ['later only as text, earlier as an instant', '2030-01-07T09:30:00Z', '2030-01-07T10:00:00+01:00'],
  ])('rejects an end that is %s', (_case, startsAt, endsAt) => {
    expectValidationError(() => normaliseCreateBooking(body({ startsAt, endsAt })));
    expectValidationError(() => update({ startsAt, endsAt }));
  });

  it('rejects an update of the start alone that reaches the stored end', () => {
    expectValidationError(() => update({ startsAt: '2030-01-07T10:00:00Z' }));
  });

  it('rejects an update of the end alone that reaches the stored start', () => {
    expectValidationError(() => update({ endsAt: '2030-01-07T09:00:00Z' }));
  });

  it('accepts an end one millisecond after the start on both paths', () => {
    const startsAt = '2030-01-07T09:00:00.000Z';
    const endsAt = '2030-01-07T09:00:00.001Z';

    expect(normaliseCreateBooking(body({ startsAt, endsAt })).endsAt.toISOString()).toBe(endsAt);
    expect(update({ endsAt })).toEqual({ endsAt: new Date(endsAt) });
  });
});
