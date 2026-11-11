import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import {
  BookingDto,
  BookingPatternEnum,
  ConfirmationStatusEnum,
  CreateBookingMessageDto,
  PagedBookingsDto,
} from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { CreateBookingService } from './create-booking.service';

const booking: BookingDto = {
  id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T08:00:00.000Z',
  updatedAt: '2029-12-01T08:00:00.000Z',
};

const patternOf = (handler: unknown): unknown => Reflect.getMetadata(PATTERN_METADATA, handler as object);

describe('BookingController', () => {
  let controller: BookingController;
  let bookingService: Record<
    'listBookings' | 'findBookingById' | 'updateBooking' | 'deleteBooking' | 'recordConfirmationResult',
    jest.Mock
  >;
  let createBooking: jest.Mock;

  beforeEach(async () => {
    bookingService = {
      recordConfirmationResult: jest.fn(),
      listBookings: jest.fn(),
      findBookingById: jest.fn(),
      updateBooking: jest.fn(),
      deleteBooking: jest.fn(),
    };
    createBooking = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        { provide: BookingService, useValue: bookingService },
        { provide: CreateBookingService, useValue: { createBooking } },
      ],
    }).compile();
    controller = moduleRef.get(BookingController);
  });

  it('answers the create pattern', async () => {
    const message: CreateBookingMessageDto = {
      idempotencyKey: '5d3c8a44-2f0e-4b7a-9c1d-6e8f0a1b2c3d',
      booking: {
        roomId: booking.roomId,
        title: booking.title,
        organizerEmail: booking.organizerEmail,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      },
    };
    const result = { booking, replayed: false };
    createBooking.mockResolvedValue(result);

    expect(patternOf(BookingController.prototype.createBooking)).toEqual([BookingPatternEnum.CREATE]);
    await expect(controller.createBooking(message)).resolves.toBe(result);
    expect(createBooking).toHaveBeenCalledWith(message);
  });

  it('answers the list pattern', async () => {
    const paged: PagedBookingsDto = { items: [booking], total: 1, page: 1, limit: 10 };
    bookingService.listBookings.mockResolvedValue(paged);

    expect(patternOf(BookingController.prototype.listBookings)).toEqual([BookingPatternEnum.LIST]);
    await expect(controller.listBookings({ page: 1, limit: 10 })).resolves.toBe(paged);
    expect(bookingService.listBookings).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('answers the find by id pattern', async () => {
    bookingService.findBookingById.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.findBookingById)).toEqual([BookingPatternEnum.FIND_BY_ID]);
    await expect(controller.findBookingById({ id: booking.id })).resolves.toBe(booking);
    expect(bookingService.findBookingById).toHaveBeenCalledWith(booking.id);
  });

  it('answers the update pattern', async () => {
    const message = { id: booking.id, changes: { title: 'Planning' } };
    bookingService.updateBooking.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.updateBooking)).toEqual([BookingPatternEnum.UPDATE]);
    await expect(controller.updateBooking(message)).resolves.toBe(booking);
    expect(bookingService.updateBooking).toHaveBeenCalledWith(message);
  });

  it('answers the delete pattern with the deleted booking', async () => {
    bookingService.deleteBooking.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.deleteBooking)).toEqual([BookingPatternEnum.DELETE]);
    await expect(controller.deleteBooking({ id: booking.id })).resolves.toBe(booking);
    expect(bookingService.deleteBooking).toHaveBeenCalledWith(booking.id);
  });

  it.each([
    ['the stored booking', booking],
    ['null for a missing booking', null],
  ])('answers the record confirmation pattern with %s', async (_case, stored) => {
    const report = { bookingId: booking.id, status: ConfirmationStatusEnum.SENT, attempts: 1 };
    bookingService.recordConfirmationResult.mockResolvedValue(stored);

    expect(patternOf(BookingController.prototype.recordConfirmationResult)).toEqual([
      BookingPatternEnum.RECORD_CONFIRMATION,
    ]);
    await expect(controller.recordConfirmationResult(report)).resolves.toBe(stored);
    expect(bookingService.recordConfirmationResult).toHaveBeenCalledWith(report);
  });
});
