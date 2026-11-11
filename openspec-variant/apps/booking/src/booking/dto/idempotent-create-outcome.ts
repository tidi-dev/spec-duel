import { IdempotencyKeyEntity } from '@roombook/backend-common';
import { BookingDto } from '@roombook/contract';

export enum IdempotentCreateOutcomeKindEnum {
  CREATED = 'CREATED',
  EXISTING = 'EXISTING',
  IN_PROGRESS = 'IN_PROGRESS',
  OVERLAP = 'OVERLAP',
}

export type IdempotentCreateOutcome =
  | { kind: IdempotentCreateOutcomeKindEnum.CREATED; booking: BookingDto }
  | { kind: IdempotentCreateOutcomeKindEnum.EXISTING; storedKey: IdempotencyKeyEntity }
  | { kind: IdempotentCreateOutcomeKindEnum.IN_PROGRESS }
  | { kind: IdempotentCreateOutcomeKindEnum.OVERLAP };
