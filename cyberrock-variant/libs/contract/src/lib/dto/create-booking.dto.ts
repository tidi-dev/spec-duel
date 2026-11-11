import { IsEmail, IsISO8601, IsString, IsUUID, Length } from 'class-validator';
import { BOOKING_TITLE_MAX_LENGTH } from '../contract.constants';

export class CreateBookingDto {
  @IsUUID()
  roomId: string;

  @IsString()
  @Length(1, BOOKING_TITLE_MAX_LENGTH)
  title: string;

  @IsEmail()
  organizerEmail: string;

  @IsISO8601({ strict: true })
  startsAt: string;

  @IsISO8601({ strict: true })
  endsAt: string;
}
