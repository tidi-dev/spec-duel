import { Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import { CreateBookingDto, CreateBookingMessageDto, CreateBookingResultDto, ErrorCodeEnum } from '@roombook/contract';
import { bookingFingerprint } from './booking-fingerprint.util';
import { raiseBookingOverlap } from './booking-overlap.error';
import { isEndAfterStart, parseBookingInstant } from './booking-time-range.util';
import { ClaimBookingOutcomeEnum, ClaimBookingResultDto } from './claim-booking-result.dto';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomClient } from './room.client';

@Injectable()
export class CreateBookingService {
  constructor(
    private readonly roomClient: RoomClient,
    private readonly idempotentBookingRepository: IdempotentBookingRepository,
    private readonly confirmationQueueProducer: ConfirmationQueueProducer,
  ) {}

  async createBooking(message: CreateBookingMessageDto): Promise<CreateBookingResultDto> {
    const key = message.idempotencyKey.toLowerCase();
    const fingerprint = bookingFingerprint(message.booking);
    const stored = await this.idempotentBookingRepository.findByKey(key);
    if (stored) {
      return stored.requestFingerprint === fingerprint
        ? { booking: stored.responseBody, replayed: true }
        : this.raiseKeyReused();
    }
    this.assertTimeRange(message.booking);
    await this.roomClient.findRoomById(message.booking.roomId);
    const claim = await this.idempotentBookingRepository.claim(key, fingerprint, message.booking);
    const result = this.toResult(claim);
    if (claim.outcome === ClaimBookingOutcomeEnum.CREATED) {
      await this.confirmationQueueProducer.enqueue(result.booking.id);
    }
    return result;
  }

  private toResult(claim: ClaimBookingResultDto): CreateBookingResultDto {
    if (claim.outcome === ClaimBookingOutcomeEnum.IN_PROGRESS) {
      ExceptionHelper.conflict(
        ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS,
        'A request with this Idempotency-Key is still being processed',
      );
    }
    if (claim.outcome === ClaimBookingOutcomeEnum.OVERLAP) {
      raiseBookingOverlap();
    }
    const booking = claim.booking ?? this.raiseKeyReused();
    return { booking, replayed: claim.outcome === ClaimBookingOutcomeEnum.REPLAYED };
  }

  private raiseKeyReused(): never {
    return ExceptionHelper.unprocessable(
      ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
      'Idempotency-Key was already used with a different request body',
    );
  }

  private assertTimeRange(booking: CreateBookingDto): void {
    const startsAt = parseBookingInstant(booking.startsAt);
    const endsAt = parseBookingInstant(booking.endsAt);
    if (!startsAt || !endsAt) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'startsAt and endsAt must be valid date-times');
    }
    if (!isEndAfterStart(startsAt, endsAt)) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'endsAt must be later than startsAt');
    }
  }
}
