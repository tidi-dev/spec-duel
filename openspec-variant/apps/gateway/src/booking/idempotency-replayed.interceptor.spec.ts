import { CallHandler, ExecutionContext } from '@nestjs/common';
import { BookingDto, ConfirmationStatusEnum, CreateBookingResultDto } from '@roombook/contract';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyReplayedInterceptor } from './idempotency-replayed.interceptor';

describe('IdempotencyReplayedInterceptor', () => {
  const booking: BookingDto = {
    id: '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f',
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Planning',
    organizerEmail: 'ana@example.com',
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T11:00:00.000Z',
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: '2029-12-01T09:00:00.000Z',
    updatedAt: '2029-12-01T09:00:00.000Z',
  };
  const interceptor = new IdempotencyReplayedInterceptor();
  let setHeader: jest.Mock;
  let context: ExecutionContext;

  const intercept = (result: CreateBookingResultDto): Promise<BookingDto> => {
    const next: CallHandler<CreateBookingResultDto> = { handle: () => of(result) };
    return lastValueFrom(interceptor.intercept(context, next));
  };

  beforeEach(() => {
    setHeader = jest.fn();
    context = { switchToHttp: () => ({ getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext;
  });

  it('answers the booking of a first create without the replay header', async () => {
    await expect(intercept({ booking, replayed: false })).resolves.toBe(booking);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('answers the booking of a replay with Idempotency-Replayed: true', async () => {
    await expect(intercept({ booking, replayed: true })).resolves.toBe(booking);
    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  });
});
