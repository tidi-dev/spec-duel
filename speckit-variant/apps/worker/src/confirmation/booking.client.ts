import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { isErrorResponse, NATS_CLIENT, NatsRequestUtil } from '@roombook/backend-common';
import {
  BookingDto,
  BookingIdMessageDto,
  BookingPatternEnum,
  ErrorCodeEnum,
  RecordConfirmationResultDto,
} from '@roombook/contract';

@Injectable()
export class BookingClient {
  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {}

  async findBooking(id: string): Promise<BookingDto | null> {
    try {
      return await NatsRequestUtil.send<BookingDto, BookingIdMessageDto>(
        this.client,
        BookingPatternEnum.FIND_BY_ID,
        { id },
      );
    } catch (error) {
      if (isErrorResponse(error) && error.errorCode === ErrorCodeEnum.BOOKING_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  recordResult(report: RecordConfirmationResultDto): Promise<BookingDto | null> {
    return NatsRequestUtil.send<BookingDto | null, RecordConfirmationResultDto>(
      this.client,
      BookingPatternEnum.RECORD_CONFIRMATION,
      report,
    );
  }
}
