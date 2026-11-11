import { Injectable } from '@nestjs/common';
import { ExceptionHelper, IdempotencyKeyEntity } from '@roombook/backend-common';
import {
  BookingDto,
  CreateBookingMessageDto,
  CreateBookingResultDto,
  ErrorCodeEnum,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { BookingFingerprintUtil } from './booking-fingerprint.util';
import { BookingTimeUtil } from './booking-time.util';
import { BookingRepository } from './booking.repository';
import { BookingValidator } from './booking.validator';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { IdempotentCreateOutcome, IdempotentCreateOutcomeKindEnum } from './dto/idempotent-create-outcome';
import { UpdateBookingOutcomeKindEnum } from './dto/update-booking-outcome';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomLookupClient } from './room-lookup.client';

const BOOKING_OVERLAP_MESSAGE = 'The room already has a booking that overlaps this time span';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly idempotentBookingRepository: IdempotentBookingRepository,
    private readonly bookingValidator: BookingValidator,
    private readonly roomLookupClient: RoomLookupClient,
    private readonly confirmationQueueProducer: ConfirmationQueueProducer,
  ) {}

  async createBooking(message: CreateBookingMessageDto): Promise<CreateBookingResultDto> {
    const { idempotencyKey, booking } = message;
    const startsAt = BookingTimeUtil.toDate(booking.startsAt);
    const endsAt = BookingTimeUtil.toDate(booking.endsAt);
    this.bookingValidator.assertTimeOrder(startsAt, endsAt);
    const requestFingerprint = BookingFingerprintUtil.of(booking);
    const storedKey = await this.idempotentBookingRepository.findByKey(idempotencyKey);
    if (storedKey) {
      return this.replay(storedKey, requestFingerprint);
    }
    await this.roomLookupClient.assertRoomExists(booking.roomId);
    const outcome = await this.idempotentBookingRepository.create({
      idempotencyKey,
      requestFingerprint,
      roomId: booking.roomId,
      title: booking.title,
      organizerEmail: booking.organizerEmail,
      startsAt,
      endsAt,
    });
    return this.resolveCreateOutcome(outcome, requestFingerprint);
  }

  listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return this.bookingRepository.findPage(query);
  }

  async findBookingById(id: string): Promise<BookingDto> {
    const booking = await this.bookingRepository.findById(id);
    return booking ?? this.raiseNotFound(id);
  }

  async updateBooking(message: UpdateBookingMessageDto): Promise<BookingDto> {
    const { id, changes } = message;
    const stored = await this.findBookingById(id);
    const startsAt = BookingTimeUtil.toDate(changes.startsAt ?? stored.startsAt);
    const endsAt = BookingTimeUtil.toDate(changes.endsAt ?? stored.endsAt);
    this.bookingValidator.assertTimeOrder(startsAt, endsAt);
    const outcome = await this.bookingRepository.update({ id, title: changes.title ?? stored.title, startsAt, endsAt });
    switch (outcome.kind) {
      case UpdateBookingOutcomeKindEnum.UPDATED:
        return outcome.booking;
      case UpdateBookingOutcomeKindEnum.NOT_FOUND:
        return this.raiseNotFound(id);
      case UpdateBookingOutcomeKindEnum.OVERLAP:
        return this.raiseOverlap();
    }
  }

  async deleteBooking(id: string): Promise<boolean> {
    const deleted = await this.bookingRepository.delete(id);
    return deleted || this.raiseNotFound(id);
  }

  recordConfirmationResult(outcome: RecordConfirmationResultDto): Promise<boolean> {
    return this.bookingRepository.recordConfirmation(outcome);
  }

  private async resolveCreateOutcome(
    outcome: IdempotentCreateOutcome,
    requestFingerprint: string,
  ): Promise<CreateBookingResultDto> {
    switch (outcome.kind) {
      case IdempotentCreateOutcomeKindEnum.CREATED:
        await this.confirmationQueueProducer.enqueue(outcome.booking.id);
        return { booking: outcome.booking, replayed: false };
      case IdempotentCreateOutcomeKindEnum.EXISTING:
        return this.replay(outcome.storedKey, requestFingerprint);
      case IdempotentCreateOutcomeKindEnum.IN_PROGRESS:
        return ExceptionHelper.conflict(
          ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS,
          'A request with this Idempotency-Key is still being processed',
        );
      case IdempotentCreateOutcomeKindEnum.OVERLAP:
        return this.raiseOverlap();
    }
  }

  private replay(storedKey: IdempotencyKeyEntity, requestFingerprint: string): CreateBookingResultDto {
    if (storedKey.requestFingerprint !== requestFingerprint) {
      ExceptionHelper.unprocessable(
        ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        'This Idempotency-Key was already used with a different body',
      );
    }
    return { booking: storedKey.responseBody, replayed: true };
  }

  private raiseOverlap(): never {
    return ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, BOOKING_OVERLAP_MESSAGE);
  }

  private raiseNotFound(id: string): never {
    return ExceptionHelper.notFound(ErrorCodeEnum.BOOKING_NOT_FOUND, `Booking ${id} was not found`);
  }
}
