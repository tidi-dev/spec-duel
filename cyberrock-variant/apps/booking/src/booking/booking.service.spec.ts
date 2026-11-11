import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum, ErrorCodeEnum, UpdateBookingDto } from '@roombook/contract';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ConfirmationProducer } from './confirmation.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

const R1 = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';

const booking: BookingDto = {
  id: ID,
  roomId: R1,
  title: 'Sprint planning',
  organizerEmail: 'ann@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const expectRejection = async (
  promise: Promise<unknown>,
  statusCode: number,
  errorCode: ErrorCodeEnum,
): Promise<void> => {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toEqual(expect.objectContaining({ statusCode, errorCode }));
};

describe('BookingService', () => {
  let service: BookingService;
  const bookings = {
    findPage: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
    recordConfirmation: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: BookingRepository, useValue: bookings },
        { provide: IdempotentBookingRepository, useValue: {} },
        { provide: ConfirmationProducer, useValue: {} },
        { provide: NATS_CLIENT, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  describe('listBookings (BKG-006)', () => {
    it('answers the page of the repository', async () => {
      const page = { items: [booking], total: 3, page: 2, limit: 2 };
      bookings.findPage.mockResolvedValue(page);

      await expect(service.listBookings({ page: 2, limit: 2, roomId: R1 })).resolves.toBe(page);
      expect(bookings.findPage).toHaveBeenCalledWith({ page: 2, limit: 2, roomId: R1 });
    });
  });

  describe('findBookingById (BKG-007)', () => {
    it('answers the booking', async () => {
      bookings.findById.mockResolvedValue(booking);

      await expect(service.findBookingById(ID)).resolves.toBe(booking);
      expect(bookings.findById).toHaveBeenCalledWith(ID);
    });

    it('answers 404 NOT_FOUND.BOOKING for an unknown id', async () => {
      bookings.findById.mockResolvedValue(null);

      await expectRejection(service.findBookingById(ID), 404, ErrorCodeEnum.BOOKING_NOT_FOUND);
    });
  });

  describe('updateBooking (BKG-008)', () => {
    it('hands the parsed changes to the repository and answers the result', async () => {
      const updated = { ...booking, endsAt: '2030-01-07T11:00:00.000Z' };
      bookings.update.mockResolvedValue(updated);

      await expect(
        service.updateBooking({ id: ID, changes: { endsAt: '2030-01-07T18:00:00+07:00' } }),
      ).resolves.toBe(updated);
      expect(bookings.update).toHaveBeenCalledWith(ID, { endsAt: new Date('2030-01-07T11:00:00.000Z') });
    });

    it('hands an empty change set on, so the repository answers the unchanged booking', async () => {
      bookings.update.mockResolvedValue(booking);

      await expect(service.updateBooking({ id: ID, changes: {} })).resolves.toBe(booking);
      expect(bookings.update).toHaveBeenCalledWith(ID, {});
    });

    it('answers 404 NOT_FOUND.BOOKING for an unknown id', async () => {
      bookings.update.mockResolvedValue(null);

      await expectRejection(
        service.updateBooking({ id: ID, changes: { title: 'Retro' } }),
        404,
        ErrorCodeEnum.BOOKING_NOT_FOUND,
      );
    });

    it.each(['title', 'startsAt', 'endsAt'])(
      'answers 400 for a null %s without touching the booking (R-01)',
      async (field) => {
        const changes = { [field]: null } as unknown as UpdateBookingDto;

        await expectRejection(service.updateBooking({ id: ID, changes }), 400, ErrorCodeEnum.VALIDATION);
        expect(bookings.update).not.toHaveBeenCalled();
      },
    );

    it('answers 400 for an instant without an offset (BKG-003)', async () => {
      await expectRejection(
        service.updateBooking({ id: ID, changes: { startsAt: '2030-01-07T09:00' } }),
        400,
        ErrorCodeEnum.VALIDATION,
      );
      expect(bookings.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteBooking (BKG-010)', () => {
    it('answers the id of the removed booking', async () => {
      bookings.deleteById.mockResolvedValue(true);

      await expect(service.deleteBooking(ID)).resolves.toEqual({ id: ID });
      expect(bookings.deleteById).toHaveBeenCalledWith(ID);
    });

    it('answers 404 NOT_FOUND.BOOKING when nothing was removed', async () => {
      bookings.deleteById.mockResolvedValue(false);

      await expectRejection(service.deleteBooking(ID), 404, ErrorCodeEnum.BOOKING_NOT_FOUND);
    });
  });

  describe('recordConfirmationResult (CNF-006)', () => {
    const result = { bookingId: ID, status: ConfirmationStatusEnum.SENT, attempts: 1 };

    it('answers the booking as stored after the result', async () => {
      const sent = { ...booking, confirmationStatus: ConfirmationStatusEnum.SENT, confirmationAttempts: 1 };
      bookings.recordConfirmation.mockResolvedValue(sent);

      await expect(service.recordConfirmationResult(result)).resolves.toBe(sent);
      expect(bookings.recordConfirmation).toHaveBeenCalledWith(result);
    });

    it('answers 404 NOT_FOUND.BOOKING for a deleted booking', async () => {
      bookings.recordConfirmation.mockResolvedValue(null);

      await expectRejection(service.recordConfirmationResult(result), 404, ErrorCodeEnum.BOOKING_NOT_FOUND);
    });
  });
});
