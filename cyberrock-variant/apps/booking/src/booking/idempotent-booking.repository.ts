import { Injectable } from '@nestjs/common';
import { BookingEntity, IDEMPOTENCY_KEYS_PRIMARY_KEY, IdempotencyKeyEntity } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource } from 'typeorm';
import { NormalisedBookingDto } from './booking-input';
import { requireFreeSpan } from './booking-overlap';
import { rethrowSpanViolation, toBookingDto, violatedConstraint } from './booking.repository';

export class IdempotentCreateDto {
  key: string;
  fingerprint: string;
  booking: NormalisedBookingDto;
}

export type IdempotentCreateOutcome =
  | { kind: 'created'; booking: BookingDto }
  | { kind: 'replayed'; booking: BookingDto }
  | { kind: 'reused' }
  | { kind: 'in-progress' };

type KeyLockRow = { obtained: boolean };

const TRY_KEY_LOCK = 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS "obtained"';

@Injectable()
export class IdempotentBookingRepository {
  constructor(private readonly dataSource: DataSource) {}

  create(command: IdempotentCreateDto): Promise<IdempotentCreateOutcome> {
    const key = command.key.toLowerCase();
    return this.dataSource
      .transaction(async (manager): Promise<IdempotentCreateOutcome> => {
        const [lock]: KeyLockRow[] = await manager.query(TRY_KEY_LOCK, [key]);
        if (!lock.obtained) {
          return { kind: 'in-progress' };
        }
        const stored = await manager.findOneBy(IdempotencyKeyEntity, { key });
        if (stored) {
          return stored.fingerprint === command.fingerprint
            ? { kind: 'replayed', booking: stored.responseBody }
            : { kind: 'reused' };
        }
        const { roomId, startsAt, endsAt } = command.booking;
        await requireFreeSpan(manager, { roomId, startsAt, endsAt });
        const entity = await manager.save(BookingEntity, {
          ...command.booking,
          confirmationStatus: ConfirmationStatusEnum.PENDING,
          confirmationAttempts: 0,
        });
        const booking = toBookingDto(entity);
        await manager.insert(IdempotencyKeyEntity, { key, fingerprint: command.fingerprint, responseBody: booking });
        return { kind: 'created', booking };
      })
      .catch(
        (error: unknown): IdempotentCreateOutcome =>
          violatedConstraint(error) === IDEMPOTENCY_KEYS_PRIMARY_KEY
            ? { kind: 'in-progress' }
            : rethrowSpanViolation(error),
      );
  }
}
