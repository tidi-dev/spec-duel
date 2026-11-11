import { Test } from '@nestjs/testing';
import { BookingDto, ConfirmationStatusEnum } from '@roombook/contract';
import { BookingClient } from './booking.client';
import { ConfirmationService } from './confirmation.service';
import { SimulatedConfirmationSender } from './simulated-confirmation.sender';

describe('ConfirmationService.confirm', () => {
  const bookingId = '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f';
  const bookingOf = (organizerEmail: string, overrides: Partial<BookingDto> = {}): BookingDto => ({
    id: bookingId,
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Planning',
    organizerEmail,
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T11:00:00.000Z',
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: '2029-12-01T09:00:00.000Z',
    updatedAt: '2029-12-01T09:00:00.000Z',
    ...overrides,
  });
  let service: ConfirmationService;
  let findBooking: jest.Mock;
  let reportOutcome: jest.Mock;
  let deliver: jest.SpyInstance;

  beforeEach(async () => {
    findBooking = jest.fn();
    reportOutcome = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfirmationService,
        SimulatedConfirmationSender,
        { provide: BookingClient, useValue: { findBooking, reportOutcome } },
      ],
    }).compile();
    service = moduleRef.get(ConfirmationService);
    deliver = jest.spyOn(moduleRef.get(SimulatedConfirmationSender), 'deliver');
  });

  it('reports SENT with 1 attempt for an ordinary address and resolves', async () => {
    findBooking.mockResolvedValue(bookingOf('ana@example.com'));

    await expect(service.confirm(bookingId, 1)).resolves.toBeUndefined();
    expect(findBooking).toHaveBeenCalledWith(bookingId);
    expect(deliver).toHaveBeenCalledWith('ana@example.com', 1);
    expect(reportOutcome).toHaveBeenCalledTimes(1);
    expect(reportOutcome).toHaveBeenCalledWith({ bookingId, status: ConfirmationStatusEnum.SENT, attempts: 1 });
  });

  it.each([1, 2])('reports PENDING with attempt %i for a retry address and rejects', async (attempt) => {
    findBooking.mockResolvedValue(bookingOf('ana@retry.example', { confirmationAttempts: attempt - 1 }));

    await expect(service.confirm(bookingId, attempt)).rejects.toThrow(`attempt ${attempt}`);
    expect(reportOutcome).toHaveBeenCalledWith({ bookingId, status: ConfirmationStatusEnum.PENDING, attempts: attempt });
  });

  it('reports SENT with 3 attempts for a retry address on attempt 3 and resolves', async () => {
    findBooking.mockResolvedValue(bookingOf('ana@retry.example', { confirmationAttempts: 2 }));

    await expect(service.confirm(bookingId, 3)).resolves.toBeUndefined();
    expect(reportOutcome).toHaveBeenCalledWith({ bookingId, status: ConfirmationStatusEnum.SENT, attempts: 3 });
  });

  it.each(['ana@bounce.example', 'ana@BOUNCE.EXAMPLE'])(
    'reports FAILED with 3 attempts for %s on attempt 3 and rejects',
    async (organizerEmail) => {
      findBooking.mockResolvedValue(bookingOf(organizerEmail, { confirmationAttempts: 2 }));

      await expect(service.confirm(bookingId, 3)).rejects.toThrow('attempt 3');
      expect(reportOutcome).toHaveBeenCalledWith({ bookingId, status: ConfirmationStatusEnum.FAILED, attempts: 3 });
    },
  );

  it('reports PENDING, not FAILED, for a bounce address before the last attempt', async () => {
    findBooking.mockResolvedValue(bookingOf('ana@bounce.example'));

    await expect(service.confirm(bookingId, 1)).rejects.toThrow('attempt 1');
    expect(reportOutcome).toHaveBeenCalledWith({ bookingId, status: ConfirmationStatusEnum.PENDING, attempts: 1 });
  });

  it('resolves without sending or reporting when the booking no longer exists', async () => {
    findBooking.mockResolvedValue(null);

    await expect(service.confirm(bookingId, 2)).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
    expect(reportOutcome).not.toHaveBeenCalled();
  });

  it.each([ConfirmationStatusEnum.SENT, ConfirmationStatusEnum.FAILED])(
    'resolves without sending or reporting when the booking is already %s',
    async (confirmationStatus) => {
      findBooking.mockResolvedValue(bookingOf('ana@bounce.example', { confirmationStatus, confirmationAttempts: 1 }));

      await expect(service.confirm(bookingId, 1)).resolves.toBeUndefined();
      expect(deliver).not.toHaveBeenCalled();
      expect(reportOutcome).not.toHaveBeenCalled();
    },
  );

  it('reports the identical outcome when the same attempt runs twice', async () => {
    findBooking.mockResolvedValue(bookingOf('ana@retry.example', { confirmationAttempts: 1 }));

    await expect(service.confirm(bookingId, 1)).rejects.toThrow();
    await expect(service.confirm(bookingId, 1)).rejects.toThrow();

    expect(reportOutcome).toHaveBeenCalledTimes(2);
    expect(reportOutcome.mock.calls[1]).toEqual(reportOutcome.mock.calls[0]);
  });

  it('rejects without sending when the booking cannot be read, so the job is retried', async () => {
    findBooking.mockRejectedValue(new Error('booking service is down'));

    await expect(service.confirm(bookingId, 1)).rejects.toThrow('booking service is down');
    expect(deliver).not.toHaveBeenCalled();
    expect(reportOutcome).not.toHaveBeenCalled();
  });
});
