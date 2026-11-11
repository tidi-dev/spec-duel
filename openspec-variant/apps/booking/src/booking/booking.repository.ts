import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import {
  BookingDto,
  ConfirmationStatusEnum,
  ListBookingsQueryDto,
  PagedBookingsDto,
  RecordConfirmationResultDto,
} from '@roombook/contract';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { BookingOverlapQuery } from './booking-overlap.query';
import { BookingMapper } from './booking.mapper';
import { UpdateBookingCommand } from './dto/update-booking.command';
import { UpdateBookingOutcome, UpdateBookingOutcomeKindEnum } from './dto/update-booking-outcome';

@Injectable()
export class BookingRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(BookingEntity) private readonly bookings: Repository<BookingEntity>,
  ) {}

  async findPage(query: ListBookingsQueryDto): Promise<PagedBookingsDto> {
    const [entities, total] = await this.bookings.findAndCount({
      where: query.roomId ? { roomId: query.roomId } : {},
      order: { startsAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: entities.map(BookingMapper.toDto), total, page: query.page, limit: query.limit };
  }

  async findById(id: string): Promise<BookingDto | null> {
    const entity = await this.bookings.findOneBy({ id });
    return entity ? BookingMapper.toDto(entity) : null;
  }

  update(command: UpdateBookingCommand): Promise<UpdateBookingOutcome> {
    return this.dataSource.transaction((manager) => this.updateLocked(manager, command));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.bookings.delete({ id });
    return Boolean(result.affected);
  }

  async recordConfirmation(outcome: RecordConfirmationResultDto): Promise<boolean> {
    const result = await this.bookings.update(
      {
        id: outcome.bookingId,
        confirmationStatus: ConfirmationStatusEnum.PENDING,
        confirmationAttempts: LessThanOrEqual(outcome.attempts),
      },
      { confirmationStatus: outcome.status, confirmationAttempts: outcome.attempts },
    );
    return Boolean(result.affected);
  }

  private async updateLocked(manager: EntityManager, command: UpdateBookingCommand): Promise<UpdateBookingOutcome> {
    const { id, ...values } = command;
    const stored = await manager.findOneBy(BookingEntity, { id });
    if (!stored) {
      return { kind: UpdateBookingOutcomeKindEnum.NOT_FOUND };
    }
    const overlaps = await BookingOverlapQuery.existsLocked(manager, {
      roomId: stored.roomId,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      excludedBookingId: id,
    });
    if (overlaps) {
      return { kind: UpdateBookingOutcomeKindEnum.OVERLAP };
    }
    const result = await manager.update(BookingEntity, { id }, values);
    if (!result.affected) {
      return { kind: UpdateBookingOutcomeKindEnum.NOT_FOUND };
    }
    const updated = await manager.findOneByOrFail(BookingEntity, { id });
    return { kind: UpdateBookingOutcomeKindEnum.UPDATED, booking: BookingMapper.toDto(updated) };
  }
}
