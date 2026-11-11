import { BookingDto } from '@roombook/contract';

export enum UpdateBookingOutcomeKindEnum {
  UPDATED = 'UPDATED',
  NOT_FOUND = 'NOT_FOUND',
  OVERLAP = 'OVERLAP',
}

export type UpdateBookingOutcome =
  | { kind: UpdateBookingOutcomeKindEnum.UPDATED; booking: BookingDto }
  | { kind: UpdateBookingOutcomeKindEnum.NOT_FOUND }
  | { kind: UpdateBookingOutcomeKindEnum.OVERLAP };
