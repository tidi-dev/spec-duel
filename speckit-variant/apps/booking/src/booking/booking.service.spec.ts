import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { toBookingDto } from './booking.mapper';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { UpdateBookingOutcomeEnum } from './update-booking-result.dto';

const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';

const bookingEntity = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: BOOKING_ID,
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Weekly sync',
    organizerEmail: 'ada@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2029-12-01T08:00:00.000Z'),
    updatedAt: new Date('2029-12-01T08:00:00.000Z'),
  });

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof RpcException ? error.getError() : error),
  );

describe('BookingService', () => {
  let service: BookingService;
  let repository: Record<'findPage' | 'findById' | 'update' | 'deleteById' | 'recordConfirmationResult', jest.Mock>;

  beforeEach(async () => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
      recordConfirmationResult: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [BookingService, { provide: BookingRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('lists a page of mapped bookings', async () => {
    repository.findPage.mockResolvedValue([[bookingEntity()], 7]);

    await expect(service.listBookings({ page: 2, limit: 5 })).resolves.toEqual({
      items: [toBookingDto(bookingEntity())],
      total: 7,
      page: 2,
      limit: 5,
    });
    expect(repository.findPage).toHaveBeenCalledWith({ page: 2, limit: 5 });
  });

  it('finds a booking by id', async () => {
    repository.findById.mockResolvedValue(bookingEntity());

    await expect(service.findBookingById(BOOKING_ID)).resolves.toEqual(toBookingDto(bookingEntity()));
    expect(repository.findById).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('raises 404 for an unknown booking', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(errorOf(service.findBookingById(BOOKING_ID))).resolves.toEqual({
      statusCode: 404,
      errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND,
      message: 'Booking not found',
    });
  });

  describe('updateBooking', () => {
    it('returns the stored booking unchanged when no field is sent', async () => {
      repository.findById.mockResolvedValue(bookingEntity());

      await expect(service.updateBooking({ id: BOOKING_ID, changes: {} })).resolves.toEqual(
        toBookingDto(bookingEntity()),
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('raises 404 when no field is sent and the booking is missing', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(errorOf(service.updateBooking({ id: BOOKING_ID, changes: {} }))).resolves.toEqual(
        expect.objectContaining({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND }),
      );
    });

    it.each(['startsAt', 'endsAt'] as const)('raises 400 when %s does not parse to an instant', async (field) => {
      await expect(
        errorOf(service.updateBooking({ id: BOOKING_ID, changes: { [field]: '2030-W02-1' } })),
      ).resolves.toEqual({
        statusCode: 400,
        errorCode: ErrorCodeEnum.VALIDATION,
        message: 'startsAt and endsAt must be valid date-times',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns the updated booking without a second read', async () => {
      const updated = Object.assign(bookingEntity(), { title: 'Planning' });
      repository.update.mockResolvedValue({ outcome: UpdateBookingOutcomeEnum.UPDATED, booking: updated });

      await expect(service.updateBooking({ id: BOOKING_ID, changes: { title: 'Planning' } })).resolves.toEqual(
        toBookingDto(updated),
      );
      expect(repository.update).toHaveBeenCalledWith(BOOKING_ID, { title: 'Planning' });
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it.each([
      [UpdateBookingOutcomeEnum.NOT_FOUND, 404, ErrorCodeEnum.BOOKING_NOT_FOUND, 'Booking not found'],
      [UpdateBookingOutcomeEnum.INVALID_TIME_RANGE, 400, ErrorCodeEnum.VALIDATION, 'endsAt must be later than startsAt'],
      [UpdateBookingOutcomeEnum.OVERLAP, 409, ErrorCodeEnum.BOOKING_OVERLAP, 'The room is already booked for that time'],
    ])('maps a %s update to %i %s without a second read', async (outcome, statusCode, errorCode, message) => {
      repository.update.mockResolvedValue({ outcome, booking: null });

      await expect(
        errorOf(service.updateBooking({ id: BOOKING_ID, changes: { endsAt: '2030-01-07T11:00:00.000Z' } })),
      ).resolves.toEqual({ statusCode, errorCode, message });
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  it('returns the deleted booking', async () => {
    repository.deleteById.mockResolvedValue(bookingEntity());

    await expect(service.deleteBooking(BOOKING_ID)).resolves.toEqual(toBookingDto(bookingEntity()));
    expect(repository.deleteById).toHaveBeenCalledWith(BOOKING_ID);
  });

  describe('recordConfirmationResult', () => {
    const report = { bookingId: BOOKING_ID, status: ConfirmationStatusEnum.SENT, attempts: 1 };

    it('returns the booking as stored after the report', async () => {
      const stored = Object.assign(bookingEntity(), { confirmationStatus: 'SENT', confirmationAttempts: 1 });
      repository.recordConfirmationResult.mockResolvedValue(stored);

      await expect(service.recordConfirmationResult(report)).resolves.toEqual(toBookingDto(stored));
      expect(repository.recordConfirmationResult).toHaveBeenCalledWith(report);
    });

    it('returns null without raising when the booking no longer exists', async () => {
      repository.recordConfirmationResult.mockResolvedValue(null);

      await expect(service.recordConfirmationResult(report)).resolves.toBeNull();
    });
  });

  it('raises 404 when the booking to delete does not exist', async () => {
    repository.deleteById.mockResolvedValue(null);

    await expect(errorOf(service.deleteBooking(BOOKING_ID))).resolves.toEqual(
      expect.objectContaining({ statusCode: 404, errorCode: ErrorCodeEnum.BOOKING_NOT_FOUND }),
    );
  });
});
