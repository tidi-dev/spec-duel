import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import {
  BookingDto,
  BookingIdMessageDto,
  BookingPatternEnum,
  CreateBookingDto,
  CreateBookingMessageDto,
  CreateBookingResultDto,
  IDEMPOTENCY_REPLAYED_HEADER,
  ListBookingsQueryDto,
  PagedBookingsDto,
  UpdateBookingDto,
  UpdateBookingMessageDto,
} from '@roombook/contract';
import { ServerResponse } from 'http';

@Injectable()
export class BookingService {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  async createBooking(idempotencyKey: string, booking: CreateBookingDto, response: ServerResponse): Promise<BookingDto> {
    const result = await NatsRequestUtil.send<CreateBookingResultDto, CreateBookingMessageDto>(
      this.client,
      BookingPatternEnum.CREATE,
      { idempotencyKey, booking },
    );
    if (result.replayed) {
      response.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
    }
    return result.booking;
  }

  listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    return NatsRequestUtil.send<PagedBookingsDto, ListBookingsQueryDto>(this.client, BookingPatternEnum.LIST, query);
  }

  findBookingById(id: string): Promise<BookingDto> {
    return NatsRequestUtil.send<BookingDto, BookingIdMessageDto>(this.client, BookingPatternEnum.FIND_BY_ID, { id });
  }

  updateBooking(id: string, changes: UpdateBookingDto): Promise<BookingDto> {
    return NatsRequestUtil.send<BookingDto, UpdateBookingMessageDto>(this.client, BookingPatternEnum.UPDATE, {
      id,
      changes,
    });
  }

  async deleteBooking(id: string): Promise<void> {
    await NatsRequestUtil.send<BookingIdMessageDto, BookingIdMessageDto>(this.client, BookingPatternEnum.DELETE, { id });
  }
}
