import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  BookingDto,
  BookingIdMessageDto,
  BookingPatternEnum,
  CreateBookingMessageDto,
  CreateBookingResultDto,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { BookingService } from './booking.service';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @MessagePattern(BookingPatternEnum.CREATE)
  createBooking(@Payload() message: CreateBookingMessageDto): Promise<CreateBookingResultDto> {
    return this.bookingService.createBooking(message);
  }

  @MessagePattern(BookingPatternEnum.LIST)
  listBookings(@Payload() query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return this.bookingService.listBookings(query);
  }

  @MessagePattern(BookingPatternEnum.FIND_BY_ID)
  findBookingById(@Payload() message: BookingIdMessageDto): Promise<BookingDto> {
    return this.bookingService.findBookingById(message.id);
  }

  @MessagePattern(BookingPatternEnum.UPDATE)
  updateBooking(@Payload() message: UpdateBookingMessageDto): Promise<BookingDto> {
    return this.bookingService.updateBooking(message);
  }

  // DELETE and RECORD_CONFIRMATION answer a boolean: the NATS client fails on a reply without a value.
  @MessagePattern(BookingPatternEnum.DELETE)
  deleteBooking(@Payload() message: BookingIdMessageDto): Promise<boolean> {
    return this.bookingService.deleteBooking(message.id);
  }

  @MessagePattern(BookingPatternEnum.RECORD_CONFIRMATION)
  recordConfirmationResult(@Payload() outcome: RecordConfirmationResultDto): Promise<boolean> {
    return this.bookingService.recordConfirmationResult(outcome);
  }
}
