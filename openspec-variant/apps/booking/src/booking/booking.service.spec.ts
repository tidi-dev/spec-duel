import { Test } from '@nestjs/testing';
import { ConfirmationStatusEnum, ErrorCodeEnum, PagedBookingsDto } from '@roombook/contract';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomLookupClient } from './room-lookup.client';
import { BOOKING_ID, bookingDto, ROOM_ID, rpcErrorOf } from './testing/booking.fixture';

describe('BookingService', () => {
  const notFound = expect.objectContaining({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND });
  let service: BookingService;
  let bookingRepository: Record<'findById' | 'findPage' | 'delete' | 'recordConfirmation', jest.Mock>;

  beforeEach(async () => {
    bookingRepository = {
      findById: jest.fn().mockResolvedValue(bookingDto()),
      findPage: jest.fn(),
      delete: jest.fn(),
      recordConfirmation: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        BookingValidator,
        { provide: BookingRepository, useValue: bookingRepository },
        { provide: IdempotentBookingRepository, useValue: {} },
        { provide: RoomLookupClient, useValue: {} },
        { provide: ConfirmationQueueProducer, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('lists a page of bookings', async () => {
    const paged: PagedBookingsDto = { items: [bookingDto()], total: 1, page: 1, limit: 10 };
    bookingRepository.findPage.mockResolvedValue(paged);

    await expect(service.listBookings({ page: 1, limit: 10, roomId: ROOM_ID })).resolves.toBe(paged);
    expect(bookingRepository.findPage).toHaveBeenCalledWith({ page: 1, limit: 10, roomId: ROOM_ID });
  });

  it('answers an empty page when no booking matches', async () => {
    const paged: PagedBookingsDto = { items: [], total: 0, page: 1, limit: 10 };
    bookingRepository.findPage.mockResolvedValue(paged);

    await expect(service.listBookings({ page: 1, limit: 10 })).resolves.toBe(paged);
  });

  it('finds a booking by id', async () => {
    await expect(service.findBookingById(BOOKING_ID)).resolves.toEqual(bookingDto());
    expect(bookingRepository.findById).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('raises 404 NOT_FOUND.BOOKING for an unknown id', async () => {
    bookingRepository.findById.mockResolvedValue(null);

    expect(await rpcErrorOf(() => service.findBookingById(BOOKING_ID))).toEqual(notFound);
  });

  it('deletes a booking', async () => {
    bookingRepository.delete.mockResolvedValue(true);

    await expect(service.deleteBooking(BOOKING_ID)).resolves.toBe(true);
    expect(bookingRepository.delete).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('raises 404 NOT_FOUND.BOOKING when the deleted id is unknown', async () => {
    bookingRepository.delete.mockResolvedValue(false);

    expect(await rpcErrorOf(() => service.deleteBooking(BOOKING_ID))).toEqual(notFound);
  });

  it('records a confirmation outcome on the booking', async () => {
    const outcome = { bookingId: BOOKING_ID, status: ConfirmationStatusEnum.SENT, attempts: 1 };
    bookingRepository.recordConfirmation.mockResolvedValue(true);

    await expect(service.recordConfirmationResult(outcome)).resolves.toBe(true);
    expect(bookingRepository.recordConfirmation).toHaveBeenCalledWith(outcome);
  });

  it('answers without error when the outcome is for an unknown or already final booking', async () => {
    bookingRepository.recordConfirmation.mockResolvedValue(false);

    await expect(
      service.recordConfirmationResult({ bookingId: BOOKING_ID, status: ConfirmationStatusEnum.PENDING, attempts: 1 }),
    ).resolves.toBe(false);
  });
});
