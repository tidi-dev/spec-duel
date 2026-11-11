import { Injectable } from '@nestjs/common';
import { ExceptionHelper } from '@roombook/backend-common';
import {
  BookingDto,
  ErrorCodeEnum,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
  UpdateBookingDto,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { raiseBookingOverlap } from './booking-overlap.error';
import { parseBookingInstant } from './booking-time-range.util';
import { toBookingDto } from './booking.mapper';
import { BookingRepository } from './booking.repository';
import { UpdateBookingOutcomeEnum } from './update-booking-result.dto';

const hasNoChange = (changes: UpdateBookingDto): boolean =>
  changes.title === undefined && changes.startsAt === undefined && changes.endsAt === undefined;

const isInstantOrAbsent = (value: string | undefined): boolean =>
  value === undefined || parseBookingInstant(value) !== null;

@Injectable()
export class BookingService {
  constructor(private readonly bookingRepository: BookingRepository) {}

  async listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    const [entities, total] = await this.bookingRepository.findPage(query);
    return { items: entities.map(toBookingDto), total, page: query.page, limit: query.limit };
  }

  async findBookingById(id: string): Promise<BookingDto> {
    const entity = await this.bookingRepository.findById(id);
    return entity ? toBookingDto(entity) : ExceptionHelper.notFound(ErrorCodeEnum.BOOKING_NOT_FOUND, 'Booking not found');
  }

  async updateBooking(message: UpdateBookingMessageDto): Promise<BookingDto> {
    const { id, changes } = message;
    if (hasNoChange(changes)) {
      return this.findBookingById(id);
    }
    if (!isInstantOrAbsent(changes.startsAt) || !isInstantOrAbsent(changes.endsAt)) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'startsAt and endsAt must be valid date-times');
    }
    const result = await this.bookingRepository.update(id, changes);
    if (result.outcome === UpdateBookingOutcomeEnum.INVALID_TIME_RANGE) {
      ExceptionHelper.badRequest(ErrorCodeEnum.VALIDATION, 'endsAt must be later than startsAt');
    }
    if (result.outcome === UpdateBookingOutcomeEnum.OVERLAP) {
      raiseBookingOverlap();
    }
    return result.booking
      ? toBookingDto(result.booking)
      : ExceptionHelper.notFound(ErrorCodeEnum.BOOKING_NOT_FOUND, 'Booking not found');
  }

  async deleteBooking(id: string): Promise<BookingDto> {
    const deleted = await this.bookingRepository.deleteById(id);
    return deleted ? toBookingDto(deleted) : ExceptionHelper.notFound(ErrorCodeEnum.BOOKING_NOT_FOUND, 'Booking not found');
  }

  async recordConfirmationResult(report: RecordConfirmationResultDto): Promise<BookingDto | null> {
    const stored = await this.bookingRepository.recordConfirmationResult(report);
    return stored ? toBookingDto(stored) : null;
  }
}
