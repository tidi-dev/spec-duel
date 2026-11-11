import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import { BookingDto, BookingPatternEnum, ConfirmationStatusEnum, CreateBookingDto } from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const B1: CreateBookingDto = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};
const booking: BookingDto = {
  ...B1,
  id: ID,
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const patternOf = (handler: unknown): unknown => Reflect.getMetadata(PATTERN_METADATA, handler as object);

describe('BookingController', () => {
  let controller: BookingController;
  const service = {
    createBooking: jest.fn(),
    listBookings: jest.fn(),
    findBookingById: jest.fn(),
    updateBooking: jest.fn(),
    deleteBooking: jest.fn(),
    recordConfirmationResult: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [{ provide: BookingService, useValue: service }],
    }).compile();
    controller = moduleRef.get(BookingController);
  });

  it('answers the create pattern with the booking and the replay flag (BKG-001)', async () => {
    const message = { idempotencyKey: '11111111-1111-4111-8111-111111111111', booking: B1 };
    const result = { booking, replayed: false };
    service.createBooking.mockResolvedValue(result);

    expect(patternOf(BookingController.prototype.createBooking)).toEqual([BookingPatternEnum.CREATE]);
    await expect(controller.createBooking(message)).resolves.toBe(result);
    expect(service.createBooking).toHaveBeenCalledWith(message);
  });

  it('answers the list pattern', async () => {
    const page = { items: [booking], total: 1, page: 1, limit: 10 };
    service.listBookings.mockResolvedValue(page);

    expect(patternOf(BookingController.prototype.listBookings)).toEqual([BookingPatternEnum.LIST]);
    await expect(controller.listBookings({ page: 1, limit: 10 })).resolves.toBe(page);
    expect(service.listBookings).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('answers the find by id pattern', async () => {
    service.findBookingById.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.findBookingById)).toEqual([BookingPatternEnum.FIND_BY_ID]);
    await expect(controller.findBookingById({ id: ID })).resolves.toBe(booking);
    expect(service.findBookingById).toHaveBeenCalledWith(ID);
  });

  it('answers the update pattern', async () => {
    const message = { id: ID, changes: { title: 'Retro' } };
    service.updateBooking.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.updateBooking)).toEqual([BookingPatternEnum.UPDATE]);
    await expect(controller.updateBooking(message)).resolves.toBe(booking);
    expect(service.updateBooking).toHaveBeenCalledWith(message);
  });

  it('answers the delete pattern', async () => {
    service.deleteBooking.mockResolvedValue({ id: ID });

    expect(patternOf(BookingController.prototype.deleteBooking)).toEqual([BookingPatternEnum.DELETE]);
    await expect(controller.deleteBooking({ id: ID })).resolves.toEqual({ id: ID });
    expect(service.deleteBooking).toHaveBeenCalledWith(ID);
  });

  it('answers the record confirmation result pattern (CNF-006)', async () => {
    const result = { bookingId: ID, status: ConfirmationStatusEnum.SENT, attempts: 1 };
    service.recordConfirmationResult.mockResolvedValue(booking);

    expect(patternOf(BookingController.prototype.recordConfirmationResult)).toEqual([
      BookingPatternEnum.RECORD_CONFIRMATION,
    ]);
    await expect(controller.recordConfirmationResult(result)).resolves.toBe(booking);
    expect(service.recordConfirmationResult).toHaveBeenCalledWith(result);
  });
});
