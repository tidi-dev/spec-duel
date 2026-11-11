import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import {
  ConfirmationStatusEnum,
  ListBookingsQueryDto,
  RecordConfirmationResultDto,
  UpdateBookingDto,
} from '@roombook/contract';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { isRoomSpanTaken, lockRoom } from './booking-overlap.query';
import { isEndAfterStart } from './booking-time-range.util';
import { UpdateBookingOutcomeEnum, UpdateBookingResultDto } from './update-booking-result.dto';

type ReturnedBookingRows = [BookingEntity[], number];

const RETURNING_BOOKING = `RETURNING
  "id",
  "room_id" AS "roomId",
  "title",
  "organizer_email" AS "organizerEmail",
  "starts_at" AS "startsAt",
  "ends_at" AS "endsAt",
  "confirmation_status" AS "confirmationStatus",
  "confirmation_attempts" AS "confirmationAttempts",
  "created_at" AS "createdAt",
  "updated_at" AS "updatedAt"`;

const UPDATE_BOOKING_SQL = `UPDATE "bookings"
SET
  "title" = COALESCE($2::varchar, "title"),
  "starts_at" = COALESCE($3::timestamptz, "starts_at"),
  "ends_at" = COALESCE($4::timestamptz, "ends_at"),
  "updated_at" = now()
WHERE "id" = $1
  AND COALESCE($4::timestamptz, "ends_at") > COALESCE($3::timestamptz, "starts_at")
${RETURNING_BOOKING}`;

const toInstantOrNull = (value: string | undefined): Date | null => (value === undefined ? null : new Date(value));

@Injectable()
export class BookingRepository {
  constructor(
    @InjectRepository(BookingEntity) private readonly bookings: Repository<BookingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findPage(query: ListBookingsQueryDto): Promise<[BookingEntity[], number]> {
    return this.bookings.findAndCount({
      where: query.roomId ? { roomId: query.roomId } : {},
      order: { startsAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  findById(id: string): Promise<BookingEntity | null> {
    return this.bookings.findOneBy({ id });
  }

  async update(id: string, changes: UpdateBookingDto): Promise<UpdateBookingResultDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await this.updateWithin(queryRunner.manager, id, changes);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateWithin(
    manager: EntityManager,
    id: string,
    changes: UpdateBookingDto,
  ): Promise<UpdateBookingResultDto> {
    const found = await manager.findOneBy(BookingEntity, { id });
    if (!found) {
      return { outcome: UpdateBookingOutcomeEnum.NOT_FOUND, booking: null };
    }
    await lockRoom(manager, found.roomId);
    const stored = await manager.findOneBy(BookingEntity, { id });
    if (!stored) {
      return { outcome: UpdateBookingOutcomeEnum.NOT_FOUND, booking: null };
    }
    const sentStartsAt = toInstantOrNull(changes.startsAt);
    const sentEndsAt = toInstantOrNull(changes.endsAt);
    const startsAt = sentStartsAt ?? stored.startsAt;
    const endsAt = sentEndsAt ?? stored.endsAt;
    if (!isEndAfterStart(startsAt, endsAt)) {
      return { outcome: UpdateBookingOutcomeEnum.INVALID_TIME_RANGE, booking: null };
    }
    if (await isRoomSpanTaken(manager, stored.roomId, startsAt, endsAt, id)) {
      return { outcome: UpdateBookingOutcomeEnum.OVERLAP, booking: null };
    }
    const [rows]: ReturnedBookingRows = await manager.query(UPDATE_BOOKING_SQL, [
      id,
      changes.title ?? null,
      sentStartsAt,
      sentEndsAt,
    ]);
    const booking = rows[0] ?? null;
    return { outcome: booking ? UpdateBookingOutcomeEnum.UPDATED : UpdateBookingOutcomeEnum.NOT_FOUND, booking };
  }

  async deleteById(id: string): Promise<BookingEntity | null> {
    const [rows]: ReturnedBookingRows = await this.bookings.query(
      `DELETE FROM "bookings" WHERE "id" = $1 ${RETURNING_BOOKING}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async recordConfirmationResult(report: RecordConfirmationResultDto): Promise<BookingEntity | null> {
    await this.bookings.update(
      {
        id: report.bookingId,
        confirmationStatus: ConfirmationStatusEnum.PENDING,
        confirmationAttempts: LessThanOrEqual(report.attempts),
      },
      { confirmationStatus: report.status, confirmationAttempts: report.attempts, updatedAt: () => 'now()' },
    );
    return this.bookings.findOneBy({ id: report.bookingId });
  }
}
