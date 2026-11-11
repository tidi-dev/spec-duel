import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiRouteEnum,
  BookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  PagedBookingsDto,
  UpdateBookingDto,
} from '@roombook/contract';
import { ServerResponse } from 'http';
import { BookingService } from './booking.service';
import { IdempotencyKey } from './idempotency-key.pipe';

@Controller(ApiRouteEnum.BOOKINGS)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  createBooking(
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateBookingDto,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<BookingDto> {
    return this.bookingService.createBooking(idempotencyKey, dto, response);
  }

  @Get()
  listBookings(@Query() query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return this.bookingService.listBookings(query);
  }

  @Get(':id')
  findBookingById(@Param('id', ParseUUIDPipe) id: string): Promise<BookingDto> {
    return this.bookingService.findBookingById(id);
  }

  @Patch(':id')
  updateBooking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookingDto): Promise<BookingDto> {
    return this.bookingService.updateBooking(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBooking(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bookingService.deleteBooking(id);
  }
}
