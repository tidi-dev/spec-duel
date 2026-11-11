import { BookingEntity, ExceptionHelper } from '@roombook/backend-common';
import { CreateBookingDto, ErrorCodeEnum, UpdateBookingDto } from '@roombook/contract';
import { INSTANT_GRAMMAR, parseInstant } from './booking-instant';

export class NormalisedBookingDto {
  roomId: string;
  title: string;
  organizerEmail: string;
  startsAt: Date;
  endsAt: Date;
}

export class BookingChangesDto {
  title?: string;
  startsAt?: Date;
  endsAt?: Date;
}

const requireInstant = (field: string, value: unknown): Date =>
  parseInstant(value) ??
  ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, `${field} must be an instant in the form ${INSTANT_GRAMMAR}`);

export const rejectInvalidSpan = (): never =>
  ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'endsAt must be later than startsAt');

const requireStorableTitle = (title: unknown): string => {
  if (typeof title !== 'string') {
    return ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'title must be a string');
  }
  // Postgres text cannot hold a NUL character.
  if (title.includes('\u0000')) {
    return ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'title must not contain a NUL character');
  }
  return title;
};

const requireSpan =(startsAt: Date, endsAt: Date): void => {
  if (endsAt.getTime() <= startsAt.getTime()) {
    rejectInvalidSpan();
  }
};

export const normaliseCreateBooking = (body: CreateBookingDto): NormalisedBookingDto => {
  const startsAt = requireInstant('startsAt', body.startsAt);
  const endsAt = requireInstant('endsAt', body.endsAt);
  requireSpan(startsAt, endsAt);
  return {
    roomId: body.roomId.toLowerCase(),
    title: requireStorableTitle(body.title),
    organizerEmail: body.organizerEmail,
    startsAt,
    endsAt,
  };
};

export const parseBookingChanges = (changes: UpdateBookingDto): BookingChangesDto => {
  const parsed = new BookingChangesDto();
  if (changes.title !== undefined) {
    parsed.title = requireStorableTitle(changes.title);
  }
  if (changes.startsAt !== undefined) {
    parsed.startsAt = requireInstant('startsAt', changes.startsAt);
  }
  if (changes.endsAt !== undefined) {
    parsed.endsAt = requireInstant('endsAt', changes.endsAt);
  }
  return parsed;
};

export const mergeBookingChanges = (stored: BookingEntity, changes: BookingChangesDto): BookingChangesDto => {
  const startsAt = changes.startsAt ?? stored.startsAt;
  const endsAt = changes.endsAt ?? stored.endsAt;
  requireSpan(startsAt, endsAt);
  const changed = new BookingChangesDto();
  if (changes.title !== undefined && changes.title !== stored.title) {
    changed.title = changes.title;
  }
  if (startsAt.getTime() !== stored.startsAt.getTime()) {
    changed.startsAt = startsAt;
  }
  if (endsAt.getTime() !== stored.endsAt.getTime()) {
    changed.endsAt = endsAt;
  }
  return changed;
};
