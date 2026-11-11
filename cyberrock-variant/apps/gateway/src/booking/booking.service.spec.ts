import { Test } from '@nestjs/testing';
import { NATS_CLIENT } from '@roombook/backend-common';
import {
  BookingDto,
  BookingPatternEnum,
  ConfirmationStatusEnum,
  CreateBookingDto,
  ErrorCodeEnum,
} from '@roombook/contract';
import { ServerResponse } from 'http';
import { of, throwError } from 'rxjs';
import { BookingService } from './booking.service';

const K1 = '11111111-1111-4111-8111-111111111111';
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

describe('BookingService (gateway)', () => {
  let service: BookingService;
  const send = jest.fn();
  const setHeader = jest.fn();
  const response = { setHeader } as unknown as ServerResponse;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [BookingService, { provide: NATS_CLIENT, useValue: { send } }],
    }).compile();
    service = moduleRef.get(BookingService);
  });

  it('forwards a create with its key and answers the booking without a replay header (BKG-001)', async () => {
    send.mockReturnValue(of({ booking, replayed: false }));

    await expect(service.createBooking(K1, B1, response)).resolves.toBe(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.CREATE, { idempotencyKey: K1, booking: B1 });
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('marks a replayed create with Idempotency-Replayed: true (IDM-003)', async () => {
    send.mockReturnValue(of({ booking, replayed: true }));

    await expect(service.createBooking(K1, B1, response)).resolves.toBe(booking);
    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  });

  it('forwards the list query (BKG-006)', async () => {
    const page = { items: [booking], total: 1, page: 1, limit: 10 };
    send.mockReturnValue(of(page));

    await expect(service.listBookings({ page: 1, limit: 10 })).resolves.toBe(page);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.LIST, { page: 1, limit: 10 });
  });

  it('forwards a read by id (BKG-007)', async () => {
    send.mockReturnValue(of(booking));

    await expect(service.findBookingById(ID)).resolves.toBe(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.FIND_BY_ID, { id: ID });
  });

  it('forwards an update with the id and the changes (BKG-008)', async () => {
    send.mockReturnValue(of(booking));

    await expect(service.updateBooking(ID, { title: 'Retro' })).resolves.toBe(booking);
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.UPDATE, { id: ID, changes: { title: 'Retro' } });
  });

  it('forwards a delete and answers nothing (BKG-010)', async () => {
    send.mockReturnValue(of({ id: ID }));

    await expect(service.deleteBooking(ID)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(BookingPatternEnum.DELETE, { id: ID });
  });

  it('passes an error of the booking service through and sets no header', async () => {
    const reused = { statusCode: 422, errorCode: 'UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED', message: 'x' };
    send.mockReturnValue(throwError(() => reused));

    await expect(service.createBooking(K1, B1, response)).rejects.toBe(reused);
    expect(setHeader).not.toHaveBeenCalled();
  });

  describe('409 CONFLICT.BOOKING_OVERLAP of the booking service', () => {
    const overlap = {
      statusCode: 409,
      errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
      message: 'The room is already booked in that time span',
    };

    beforeEach(() => {
      send.mockReturnValue(throwError(() => overlap));
    });

    it('reaches the answer of a create unchanged, with no replay header (BKG-013)', async () => {
      const error = await service.createBooking(K1, B1, response).catch((caught: unknown) => caught);

      expect(error).toBe(overlap);
      expect(error).toEqual({
        statusCode: 409,
        errorCode: 'CONFLICT.BOOKING_OVERLAP',
        message: 'The room is already booked in that time span',
      });
      expect(send).toHaveBeenCalledWith(BookingPatternEnum.CREATE, { idempotencyKey: K1, booking: B1 });
      expect(setHeader).not.toHaveBeenCalled();
    });

    it('reaches the answer of an update unchanged (BKG-014)', async () => {
      const changes = { startsAt: '2030-01-07T09:59:59.999Z' };

      await expect(service.updateBooking(ID, changes)).rejects.toBe(overlap);
      expect(send).toHaveBeenCalledWith(BookingPatternEnum.UPDATE, { id: ID, changes });
    });
  });
});
