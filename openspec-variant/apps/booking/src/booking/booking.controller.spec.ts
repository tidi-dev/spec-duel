import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import { BookingPatternEnum, ConfirmationStatusEnum, PagedBookingsDto } from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BOOKING_ID, bookingDto, ROOM_ID } from './testing/booking.fixture';

const patternOf = (handler: keyof BookingController): unknown =>
  Reflect.getMetadata(PATTERN_METADATA, BookingController.prototype[handler]);

describe('BookingController', () => {
  let controller: BookingController;
  let service: Record<keyof BookingController, jest.Mock>;

  beforeEach(async () => {
    service = {
      createBooking: jest.fn(),
      listBookings: jest.fn(),
      findBookingById: jest.fn(),
      updateBooking: jest.fn(),
      deleteBooking: jest.fn(),
      recordConfirmationResult: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [{ provide: BookingService, useValue: service }],
    }).compile();
    controller = moduleRef.get(BookingController);
  });

  it('answers the create booking pattern', async () => {
    const result = { booking: bookingDto(), replayed: false };
    const message = {
      idempotencyKey: '0b9d6f1c-5a3e-4f7b-8c2d-1e0f9a8b7c6d',
      booking: {
        roomId: ROOM_ID,
        title: 'Planning',
        organizerEmail: 'ana@example.com',
        startsAt: '2030-01-01T10:00:00Z',
        endsAt: '2030-01-01T11:00:00Z',
      },
    };
    service.createBooking.mockResolvedValue(result);

    expect(patternOf('createBooking')).toEqual([BookingPatternEnum.CREATE]);
    await expect(controller.createBooking(message)).resolves.toBe(result);
    expect(service.createBooking).toHaveBeenCalledWith(message);
  });

  it.each([
    ['a recorded outcome', true],
    ['an unknown booking id, without error', false],
  ])('answers the record confirmation pattern for %s', async (_case, recorded) => {
    const outcome = { bookingId: BOOKING_ID, status: ConfirmationStatusEnum.SENT, attempts: 1 };
    service.recordConfirmationResult.mockResolvedValue(recorded);

    expect(patternOf('recordConfirmationResult')).toEqual([BookingPatternEnum.RECORD_CONFIRMATION]);
    await expect(controller.recordConfirmationResult(outcome)).resolves.toBe(recorded);
    expect(service.recordConfirmationResult).toHaveBeenCalledWith(outcome);
  });

  it('answers the booking list pattern', async () => {
    const paged: PagedBookingsDto = { items: [bookingDto()], total: 1, page: 1, limit: 10 };
    service.listBookings.mockResolvedValue(paged);

    expect(patternOf('listBookings')).toEqual([BookingPatternEnum.LIST]);
    await expect(controller.listBookings({ page: 1, limit: 10 })).resolves.toBe(paged);
    expect(service.listBookings).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('answers the find booking by id pattern', async () => {
    const booking = bookingDto();
    service.findBookingById.mockResolvedValue(booking);

    expect(patternOf('findBookingById')).toEqual([BookingPatternEnum.FIND_BY_ID]);
    await expect(controller.findBookingById({ id: BOOKING_ID })).resolves.toBe(booking);
    expect(service.findBookingById).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('answers the update booking pattern', async () => {
    const booking = bookingDto({ title: 'Retro' });
    const message = { id: BOOKING_ID, changes: { title: 'Retro' } };
    service.updateBooking.mockResolvedValue(booking);

    expect(patternOf('updateBooking')).toEqual([BookingPatternEnum.UPDATE]);
    await expect(controller.updateBooking(message)).resolves.toBe(booking);
    expect(service.updateBooking).toHaveBeenCalledWith(message);
  });

  it('answers the delete booking pattern', async () => {
    service.deleteBooking.mockResolvedValue(true);

    expect(patternOf('deleteBooking')).toEqual([BookingPatternEnum.DELETE]);
    await expect(controller.deleteBooking({ id: BOOKING_ID })).resolves.toBe(true);
    expect(service.deleteBooking).toHaveBeenCalledWith(BOOKING_ID);
  });
});
