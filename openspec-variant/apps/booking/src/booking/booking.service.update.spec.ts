import { Test } from '@nestjs/testing';
import { ErrorCodeEnum } from '@roombook/contract';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { UpdateBookingOutcome, UpdateBookingOutcomeKindEnum } from './dto/update-booking-outcome';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomLookupClient } from './room-lookup.client';
import { BOOKING_ID, bookingDto, rpcErrorOf } from './testing/booking.fixture';

describe('BookingService.updateBooking', () => {
  const notFound = expect.objectContaining({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND });
  const updatedWith = (booking = bookingDto()): UpdateBookingOutcome => ({
    kind: UpdateBookingOutcomeKindEnum.UPDATED,
    booking,
  });
  let service: BookingService;
  let findById: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    findById = jest.fn().mockResolvedValue(bookingDto());
    update = jest.fn().mockResolvedValue(updatedWith());
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        BookingValidator,
        { provide: BookingRepository, useValue: { findById, update } },
        { provide: IdempotentBookingRepository, useValue: {} },
        { provide: RoomLookupClient, useValue: {} },
        { provide: ConfirmationQueueProducer, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('updates the changed title and keeps the stored times', async () => {
    const updated = bookingDto({ title: 'Retro' });
    update.mockResolvedValue(updatedWith(updated));

    await expect(service.updateBooking({ id: BOOKING_ID, changes: { title: 'Retro' } })).resolves.toBe(updated);
    expect(update).toHaveBeenCalledWith({
      id: BOOKING_ID,
      title: 'Retro',
      startsAt: new Date('2030-01-01T10:00:00.000Z'),
      endsAt: new Date('2030-01-01T11:00:00.000Z'),
    });
  });

  it('updates both times, reading an offset and a zone-less value as UTC instants', async () => {
    await service.updateBooking({
      id: BOOKING_ID,
      changes: { startsAt: '2030-02-01T10:00:00+02:00', endsAt: '2030-02-01T09:00:00' },
    });

    expect(update).toHaveBeenCalledWith({
      id: BOOKING_ID,
      title: 'Planning',
      startsAt: new Date('2030-02-01T08:00:00.000Z'),
      endsAt: new Date('2030-02-01T09:00:00.000Z'),
    });
  });

  it('keeps every stored value for an empty change set', async () => {
    await expect(service.updateBooking({ id: BOOKING_ID, changes: {} })).resolves.toEqual(bookingDto());
    expect(update).toHaveBeenCalledWith({
      id: BOOKING_ID,
      title: 'Planning',
      startsAt: new Date('2030-01-01T10:00:00.000Z'),
      endsAt: new Date('2030-01-01T11:00:00.000Z'),
    });
  });

  it.each([
    ['moves startsAt past the stored endsAt', { startsAt: '2030-01-01T12:00:00Z' }],
    ['moves endsAt onto the stored startsAt', { endsAt: '2030-01-01T10:00:00Z' }],
    ['carries a time that is not an instant', { startsAt: '2030-W01-1' }],
  ])('raises 400 BAD_REQUEST.VALIDATION and stores nothing when an update %s', async (_case, changes) => {
    expect(await rpcErrorOf(() => service.updateBooking({ id: BOOKING_ID, changes }))).toEqual(
      expect.objectContaining({ statusCode: 400, errorCode: ErrorCodeEnum.VALIDATION }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('raises 404 NOT_FOUND.BOOKING when the updated id is unknown', async () => {
    findById.mockResolvedValue(null);

    expect(await rpcErrorOf(() => service.updateBooking({ id: BOOKING_ID, changes: { title: 'x' } }))).toEqual(
      notFound,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('raises 404 NOT_FOUND.BOOKING when the booking is deleted while it is updated', async () => {
    update.mockResolvedValue({ kind: UpdateBookingOutcomeKindEnum.NOT_FOUND });

    expect(await rpcErrorOf(() => service.updateBooking({ id: BOOKING_ID, changes: { title: 'x' } }))).toEqual(
      notFound,
    );
  });

  it('raises 409 CONFLICT.BOOKING_OVERLAP with a message when the new span is taken', async () => {
    update.mockResolvedValue({ kind: UpdateBookingOutcomeKindEnum.OVERLAP });

    expect(
      await rpcErrorOf(() => service.updateBooking({ id: BOOKING_ID, changes: { endsAt: '2030-01-01T11:30:00Z' } })),
    ).toEqual({
      statusCode: 409,
      errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
      message: 'The room already has a booking that overlaps this time span',
    });
  });
});
