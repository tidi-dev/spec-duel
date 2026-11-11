import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BookingOverlapQuery } from './booking-overlap.query';
import { BookingMapper } from './booking.mapper';
import { CreateBookingCommand } from './dto/create-booking.command';
import { IdempotentCreateOutcome, IdempotentCreateOutcomeKindEnum } from './dto/idempotent-create-outcome';

type AdvisoryLockRow = { locked: boolean };

const TRY_KEY_LOCK_SQL = 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS "locked"';

@Injectable()
export class IdempotentBookingRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(IdempotencyKeyEntity) private readonly keys: Repository<IdempotencyKeyEntity>,
  ) {}

  findByKey(key: string): Promise<IdempotencyKeyEntity | null> {
    return this.keys.findOneBy({ key });
  }

  create(command: CreateBookingCommand): Promise<IdempotentCreateOutcome> {
    return this.dataSource.transaction((manager) => this.createLocked(manager, command));
  }

  private async createLocked(manager: EntityManager, command: CreateBookingCommand): Promise<IdempotentCreateOutcome> {
    const { idempotencyKey: key, requestFingerprint, ...values } = command;
    const [lock] = await manager.query<AdvisoryLockRow[]>(TRY_KEY_LOCK_SQL, [key]);
    if (!lock.locked) {
      return { kind: IdempotentCreateOutcomeKindEnum.IN_PROGRESS };
    }
    const storedKey = await manager.findOneBy(IdempotencyKeyEntity, { key });
    if (storedKey) {
      return { kind: IdempotentCreateOutcomeKindEnum.EXISTING, storedKey };
    }
    const { roomId, startsAt, endsAt } = values;
    if (await BookingOverlapQuery.existsLocked(manager, { roomId, startsAt, endsAt })) {
      return { kind: IdempotentCreateOutcomeKindEnum.OVERLAP };
    }
    const entity = manager.create(BookingEntity, {
      ...values,
      confirmationStatus: ConfirmationStatusEnum.PENDING,
      confirmationAttempts: 0,
    });
    const booking = BookingMapper.toDto(await manager.save(BookingEntity, entity));
    await manager.insert(IdempotencyKeyEntity, {
      key,
      requestFingerprint,
      responseStatus: HttpStatus.CREATED,
      responseBody: booking,
    });
    return { kind: IdempotentCreateOutcomeKindEnum.CREATED, booking };
  }
}
