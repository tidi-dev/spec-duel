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
import { CreateBookingService } from './create-booking.service';

@Controller()
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly createBookingService: CreateBookingService,
  ) {}

  @MessagePattern(BookingPatternEnum.CREATE)
  createBooking(@Payload() message: CreateBookingMessageDto): Promise<CreateBookingResultDto> {
    return this.createBookingService.createBooking(message);
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

  @MessagePattern(BookingPatternEnum.DELETE)
  deleteBooking(@Payload() message: BookingIdMessageDto): Promise<BookingDto> {
    return this.bookingService.deleteBooking(message.id);
  }

  @MessagePattern(BookingPatternEnum.RECORD_CONFIRMATION)
  recordConfirmationResult(@Payload() report: RecordConfirmationResultDto): Promise<BookingDto | null> {
    return this.bookingService.recordConfirmationResult(report);
  }
}
