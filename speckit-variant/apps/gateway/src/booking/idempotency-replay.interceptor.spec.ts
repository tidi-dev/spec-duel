import 'reflect-metadata';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  BookingDto,
  ConfirmationStatusEnum,
  CreateBookingResultDto,
  IDEMPOTENCY_REPLAYED_HEADER,
} from '@roombook/contract';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyReplayInterceptor } from './idempotency-replay.interceptor';

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

describe('IdempotencyReplayInterceptor', () => {
  let setHeader: jest.Mock;
  let context: ExecutionContext;

  const intercept = (result: CreateBookingResultDto): Promise<BookingDto> => {
    const next: CallHandler<CreateBookingResultDto> = { handle: () => of(result) };
    return lastValueFrom(new IdempotencyReplayInterceptor().intercept(context, next));
  };

  beforeEach(() => {
    setHeader = jest.fn();
    context = { switchToHttp: () => ({ getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext;
  });

  it('answers the booking alone and sets no header for a first answer', async () => {
    await expect(intercept({ booking, replayed: false })).resolves.toBe(booking);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('answers the booking and marks the response as replayed', async () => {
    await expect(intercept({ booking, replayed: true })).resolves.toBe(booking);
    expect(setHeader).toHaveBeenCalledWith(IDEMPOTENCY_REPLAYED_HEADER, 'true');
  });
});
