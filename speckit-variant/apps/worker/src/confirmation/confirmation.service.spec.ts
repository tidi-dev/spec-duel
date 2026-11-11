import { Test } from '@nestjs/testing';
import { BookingDto, CONFIRMATION_JOB_ATTEMPTS, ConfirmationStatusEnum } from '@roombook/contract';
import { BookingClient } from './booking.client';
import { ConfirmationService } from './confirmation.service';
import { SimulatedConfirmationSender } from './simulated-confirmation-sender';

const bookingWithStatus = (confirmationStatus: ConfirmationStatusEnum): BookingDto => ({
  id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Weekly sync',
  organizerEmail: 'ada@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
  confirmationStatus,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T08:00:00.000Z',
  updatedAt: '2029-12-01T08:00:00.000Z',
});

const pending = bookingWithStatus(ConfirmationStatusEnum.PENDING);

describe('ConfirmationService', () => {
  let service: ConfirmationService;
  let findBooking: jest.Mock;
  let recordResult: jest.Mock;
  let send: jest.Mock;

  beforeEach(async () => {
    findBooking = jest.fn().mockResolvedValue(pending);
    recordResult = jest.fn().mockResolvedValue(pending);
    send = jest.fn().mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfirmationService,
        { provide: BookingClient, useValue: { findBooking, recordResult } },
        { provide: SimulatedConfirmationSender, useValue: { send } },
      ],
    }).compile();
    service = moduleRef.get(ConfirmationService);
  });

  it('completes without a report when the booking is not found', async () => {
    findBooking.mockResolvedValue(null);

    await expect(service.processAttempt(pending.id, 1)).resolves.toBeUndefined();
    expect(findBooking).toHaveBeenCalledWith(pending.id);
    expect(send).not.toHaveBeenCalled();
    expect(recordResult).not.toHaveBeenCalled();
  });

  it.each([ConfirmationStatusEnum.SENT, ConfirmationStatusEnum.FAILED])(
    'completes without a report when the booking is already %s',
    async (status) => {
      findBooking.mockResolvedValue(bookingWithStatus(status));

      await expect(service.processAttempt(pending.id, 2)).resolves.toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      expect(recordResult).not.toHaveBeenCalled();
    },
  );

  it('reports SENT with the attempt and completes when the sender succeeds', async () => {
    await expect(service.processAttempt(pending.id, 2)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith(pending.organizerEmail, 2);
    expect(recordResult).toHaveBeenCalledWith({
      bookingId: pending.id,
      status: ConfirmationStatusEnum.SENT,
      attempts: 2,
    });
  });

  it('reports PENDING with the attempt, then fails, when the sender fails with retries left', async () => {
    send.mockReturnValue(false);

    await expect(service.processAttempt(pending.id, CONFIRMATION_JOB_ATTEMPTS - 1)).rejects.toBeInstanceOf(Error);
    expect(recordResult).toHaveBeenCalledWith({
      bookingId: pending.id,
      status: ConfirmationStatusEnum.PENDING,
      attempts: CONFIRMATION_JOB_ATTEMPTS - 1,
    });
  });

  it('reports FAILED with the attempt, then fails, when the sender fails on the last attempt', async () => {
    send.mockReturnValue(false);

    await expect(service.processAttempt(pending.id, CONFIRMATION_JOB_ATTEMPTS)).rejects.toBeInstanceOf(Error);
    expect(recordResult).toHaveBeenCalledWith({
      bookingId: pending.id,
      status: ConfirmationStatusEnum.FAILED,
      attempts: CONFIRMATION_JOB_ATTEMPTS,
    });
  });

  it('fails without a report when the booking service does not answer', async () => {
    const unavailable = new Error('No service answered booking:findBookingById');
    findBooking.mockRejectedValue(unavailable);

    await expect(service.processAttempt(pending.id, 1)).rejects.toBe(unavailable);
    expect(recordResult).not.toHaveBeenCalled();
  });
});
