import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { ExceptionHelper, NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import {
  BookingDto,
  BookingIdMessageDto,
  CreateBookingMessageDto,
  CreateBookingResultDto,
  ErrorCodeEnum,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
  RoomDto,
  RoomIdMessageDto,
  RoomPatternEnum,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { bookingFingerprint } from './booking-fingerprint';
import { normaliseCreateBooking, parseBookingChanges } from './booking-input';
import { BookingRepository } from './booking.repository';
import { ConfirmationProducer } from './confirmation.producer';
import { IdempotentBookingRepository, IdempotentCreateOutcome } from './idempotent-booking.repository';

const toCreateResult = (outcome: IdempotentCreateOutcome): CreateBookingResultDto => {
  switch (outcome.kind) {
    case 'created':
      return { booking: outcome.booking, replayed: false };
    case 'replayed':
      return { booking: outcome.booking, replayed: true };
    case 'reused':
      return ExceptionHelper.unprocessable(
        ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key was already used for a different request body',
      );
    case 'in-progress':
      return ExceptionHelper.conflict(
        ErrorCodeEnum.IDEMPOTENCY_IN_PROGRESS,
        'A request with this Idempotency-Key is still being processed',
      );
  }
};

const bookingNotFound = (id: string): never =>
  ExceptionHelper.notFound(ErrorCodeEnum.BOOKING_NOT_FOUND, `Booking ${id} was not found`);

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly idempotentBookingRepository: IdempotentBookingRepository,
    private readonly confirmationProducer: ConfirmationProducer,
    @Inject(NATS_CLIENT) private readonly client: ClientProxy,
  ) {}

  async createBooking(message: CreateBookingMessageDto): Promise<CreateBookingResultDto> {
    const booking = normaliseCreateBooking(message.booking);
    await this.requireRoom(booking.roomId);
    const outcome = await this.idempotentBookingRepository.create({
      key: message.idempotencyKey,
      fingerprint: bookingFingerprint(booking),
      booking,
    });
    const result = toCreateResult(outcome);
    await this.confirmationProducer.enqueue(result.booking.id);
    return result;
  }

  listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return this.bookingRepository.findPage(query);
  }

  async findBookingById(id: string): Promise<BookingDto> {
    const booking = await this.bookingRepository.findById(id);
    return booking ?? bookingNotFound(id);
  }

  async updateBooking(message: UpdateBookingMessageDto): Promise<BookingDto> {
    const booking = await this.bookingRepository.update(message.id, parseBookingChanges(message.changes));
    return booking ?? bookingNotFound(message.id);
  }

  async deleteBooking(id: string): Promise<BookingIdMessageDto> {
    const deleted = await this.bookingRepository.deleteById(id);
    return deleted ? { id } : bookingNotFound(id);
  }

  async recordConfirmationResult(result: RecordConfirmationResultDto): Promise<BookingDto> {
    const booking = await this.bookingRepository.recordConfirmation(result);
    return booking ?? bookingNotFound(result.bookingId);
  }

  private async requireRoom(roomId: string): Promise<void> {
    await NatsRequestUtil.send<RoomDto, RoomIdMessageDto>(this.client, RoomPatternEnum.FIND_BY_ID, {
      id: roomId,
    }).catch((error: unknown) => {
      // The room service's own answer arrives as a plain object; only an RpcException crosses NATS intact.
      throw error instanceof RpcException ? error : new RpcException(error as object);
    });
  }
}
