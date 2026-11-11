import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { CreateBookingDto } from '@roombook/contract';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isRoomSpanTaken, lockRoom } from './booking-overlap.query';
import { toBookingDto } from './booking.mapper';
import { ClaimBookingOutcomeEnum, ClaimBookingResultDto } from './claim-booking-result.dto';

type TryLockRow = { locked: boolean };

const TRY_LOCK_SQL = 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS "locked"';

@Injectable()
export class IdempotentBookingRepository {
  constructor(
    @InjectRepository(IdempotencyKeyEntity) private readonly idempotencyKeys: Repository<IdempotencyKeyEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findByKey(key: string): Promise<IdempotencyKeyEntity | null> {
    return this.idempotencyKeys.findOneBy({ key });
  }

  async claim(key: string, fingerprint: string, booking: CreateBookingDto): Promise<ClaimBookingResultDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await this.claimWithin(queryRunner.manager, key, fingerprint, booking);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async claimWithin(
    manager: EntityManager,
    key: string,
    fingerprint: string,
    booking: CreateBookingDto,
  ): Promise<ClaimBookingResultDto> {
    if (!(await this.tryLock(manager, `${key}:${fingerprint}`))) {
      return { outcome: ClaimBookingOutcomeEnum.IN_PROGRESS, booking: null };
    }
    if (!(await this.tryLock(manager, key))) {
      return { outcome: ClaimBookingOutcomeEnum.KEY_REUSED, booking: null };
    }
    const stored = await manager.findOneBy(IdempotencyKeyEntity, { key });
    if (stored) {
      return stored.requestFingerprint === fingerprint
        ? { outcome: ClaimBookingOutcomeEnum.REPLAYED, booking: stored.responseBody }
        : { outcome: ClaimBookingOutcomeEnum.KEY_REUSED, booking: null };
    }
    await lockRoom(manager, booking.roomId);
    if (await isRoomSpanTaken(manager, booking.roomId, new Date(booking.startsAt), new Date(booking.endsAt), null)) {
      return { outcome: ClaimBookingOutcomeEnum.OVERLAP, booking: null };
    }
    return this.insertBookingWithKey(manager, key, fingerprint, booking);
  }

  private async tryLock(manager: EntityManager, lockName: string): Promise<boolean> {
    const [row]: TryLockRow[] = await manager.query(TRY_LOCK_SQL, [lockName]);
    return row.locked;
  }

  private async insertBookingWithKey(
    manager: EntityManager,
    key: string,
    fingerprint: string,
    booking: CreateBookingDto,
  ): Promise<ClaimBookingResultDto> {
    const saved = await manager.save(BookingEntity, {
      roomId: booking.roomId,
      title: booking.title,
      organizerEmail: booking.organizerEmail,
      startsAt: new Date(booking.startsAt),
      endsAt: new Date(booking.endsAt),
    });
    const responseBody = toBookingDto(saved);
    await manager.insert(IdempotencyKeyEntity, {
      key,
      requestFingerprint: fingerprint,
      responseStatus: HttpStatus.CREATED,
      responseBody,
    });
    return { outcome: ClaimBookingOutcomeEnum.CREATED, booking: responseBody };
  }
}
