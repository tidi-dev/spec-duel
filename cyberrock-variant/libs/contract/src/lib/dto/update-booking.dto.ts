import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';
import { BOOKING_TITLE_MAX_LENGTH } from '../contract.constants';

export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  @Length(1, BOOKING_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;
}
