import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import {
  ApiRouteEnum,
  BookingDto,
  BookingIdMessageDto,
  BookingPatternEnum,
  CreateBookingDto,
  CreateBookingMessageDto,
  CreateBookingResultDto,
  IDEMPOTENCY_KEY_HEADER,
  ListBookingsQueryDto,
  PagedBookingsDto,
  UpdateBookingDto,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { IdempotencyKeyGuard } from './idempotency-key.guard';
import { IdempotencyReplayedInterceptor } from './idempotency-replayed.interceptor';

@Controller(ApiRouteEnum.BOOKINGS)
export class BookingController {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  @Post()
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyReplayedInterceptor)
  createBooking(
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string,
    @Body() booking: CreateBookingDto,
  ): Promise<CreateBookingResultDto> {
    return NatsRequestUtil.send<CreateBookingResultDto, CreateBookingMessageDto>(
      this.client,
      BookingPatternEnum.CREATE,
      { idempotencyKey, booking },
    );
  }

  @Get()
  listBookings(@Query() query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return NatsRequestUtil.send<PagedBookingsDto, ListBookingsQueryDto>(this.client, BookingPatternEnum.LIST, query);
  }

  @Get(':id')
  findBookingById(@Param('id', ParseUUIDPipe) id: string): Promise<BookingDto> {
    return NatsRequestUtil.send<BookingDto, BookingIdMessageDto>(this.client, BookingPatternEnum.FIND_BY_ID, { id });
  }

  @Patch(':id')
  updateBooking(@Param('id', ParseUUIDPipe) id: string, @Body() changes: UpdateBookingDto): Promise<BookingDto> {
    return NatsRequestUtil.send<BookingDto, UpdateBookingMessageDto>(this.client, BookingPatternEnum.UPDATE, {
      id,
      changes,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBooking(@Param('id', ParseUUIDPipe) id: string): Promise<boolean> {
    return NatsRequestUtil.send<boolean, BookingIdMessageDto>(this.client, BookingPatternEnum.DELETE, { id });
  }
}
