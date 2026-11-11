import { BookingDto } from '@roombook/contract';

export enum ClaimBookingOutcomeEnum {
  CREATED = 'CREATED',
  REPLAYED = 'REPLAYED',
  KEY_REUSED = 'KEY_REUSED',
  IN_PROGRESS = 'IN_PROGRESS',
  OVERLAP = 'OVERLAP',
}

export class ClaimBookingResultDto {
  outcome: ClaimBookingOutcomeEnum;
  booking: BookingDto | null;
}
