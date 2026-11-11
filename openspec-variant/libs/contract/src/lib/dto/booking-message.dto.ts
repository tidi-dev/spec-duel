import { BookingDto } from './booking.dto';
import { CreateBookingDto } from './create-booking.dto';
import { UpdateBookingDto } from './update-booking.dto';

export class CreateBookingMessageDto {
  idempotencyKey: string;
  booking: CreateBookingDto;
}

export class CreateBookingResultDto {
  booking: BookingDto;
  replayed: boolean;
}

export class UpdateBookingMessageDto {
  id: string;
  changes: UpdateBookingDto;
}

export class BookingIdMessageDto {
  id: string;
}
