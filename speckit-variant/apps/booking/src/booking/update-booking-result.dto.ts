import { BookingEntity } from '@roombook/backend-common';

export enum UpdateBookingOutcomeEnum {
  UPDATED = 'UPDATED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  OVERLAP = 'OVERLAP',
}

export class UpdateBookingResultDto {
  outcome: UpdateBookingOutcomeEnum;
  booking: BookingEntity | null;
}
