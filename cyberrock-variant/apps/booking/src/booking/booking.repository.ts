import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity, BOOKINGS_ROOM_SPAN_CONSTRAINT, BOOKINGS_SPAN_CONSTRAINT } from '@roombook/backend-common';
import {
  BookingDto,
  ConfirmationStatusEnum,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
} from '@roombook/contract';
import { DataSource, LessThanOrEqual, Not, QueryFailedError, Repository } from 'typeorm';
import { BookingChangesDto, mergeBookingChanges, rejectInvalidSpan } from './booking-input';
import { rejectOverlap, requireFreeSpan } from './booking-overlap';

type ConstraintError = Error & { constraint?: string };

export const toBookingDto = (entity: BookingEntity): BookingDto => ({
  id: entity.id,
  roomId: entity.roomId,
  title: entity.title,
  organizerEmail: entity.organizerEmail,
  startsAt: entity.startsAt.toISOString(),
  endsAt: entity.endsAt.toISOString(),
  confirmationStatus: entity.confirmationStatus,
  confirmationAttempts: entity.confirmationAttempts,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const violatedConstraint = (error: unknown): string | undefined =>
  error instanceof QueryFailedError ? (error.driverError as ConstraintError).constraint : undefined;

export const rethrowSpanViolation = (error: unknown): never => {
  switch (violatedConstraint(error)) {
    case BOOKINGS_SPAN_CONSTRAINT:
      return rejectInvalidSpan();
    case BOOKINGS_ROOM_SPAN_CONSTRAINT:
      return rejectOverlap();
    default:
      throw error;
  }
};

@Injectable()
export class BookingRepository {
  constructor(
    @InjectRepository(BookingEntity) private readonly bookings: Repository<BookingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findPage(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    const where = query.roomId ? { roomId: query.roomId } : {};
    const skip = (query.page - 1) * query.limit;
    // Postgres refuses an OFFSET beyond bigint; such a page is past the end.
    if (!Number.isSafeInteger(skip)) {
      return { items: [], total: await this.bookings.count({ where }), page: query.page, limit: query.limit };
    }
    const [entities, total] = await this.bookings.findAndCount({
      where,
      order: { startsAt: 'ASC', id: 'ASC' },
      skip,
      take: query.limit,
    });
    return { items: entities.map(toBookingDto), total, page: query.page, limit: query.limit };
  }

  async findById(id: string): Promise<BookingDto | null> {
    const entity = await this.bookings.findOneBy({ id });
    return entity ? toBookingDto(entity) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.bookings.delete({ id });
    return result.affected === 1;
  }

  update(id: string, changes: BookingChangesDto): Promise<BookingDto | null> {
    return this.dataSource
      .transaction(async (manager) => {
        const stored = await manager.findOne(BookingEntity, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!stored) {
          return null;
        }
        const changed = mergeBookingChanges(stored, changes);
        if (Object.keys(changed).length === 0) {
          return toBookingDto(stored);
        }
        if (changed.startsAt || changed.endsAt) {
          const { roomId, startsAt, endsAt } = { ...stored, ...changed };
          await requireFreeSpan(manager, { roomId, startsAt, endsAt, ownId: id });
        }
        await manager.update(BookingEntity, { id }, changed);
        return toBookingDto(await manager.findOneByOrFail(BookingEntity, { id }));
      })
      .catch(rethrowSpanViolation);
  }

  async recordConfirmation(result: RecordConfirmationResultDto): Promise<BookingDto | null> {
    await this.bookings.update(
      {
        id: result.bookingId,
        confirmationStatus: Not(ConfirmationStatusEnum.SENT),
        confirmationAttempts: LessThanOrEqual(result.attempts),
      },
      { confirmationStatus: result.status, confirmationAttempts: result.attempts },
    );
    return this.findById(result.bookingId);
  }
}
