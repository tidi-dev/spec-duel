import { BookingEntity, ExceptionHelper } from '@roombook/backend-common';
import { ErrorCodeEnum } from '@roombook/contract';
import { EntityManager, LessThan, MoreThan, Not } from 'typeorm';

export class RoomSpanDto {
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  ownId?: string;
}

const ROOM_LOCK = `SELECT pg_advisory_xact_lock(hashtextextended('room:' || $1, 0))`;

export const rejectOverlap = (): never =>
  ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, 'The room is already booked in that time span');

export const requireFreeSpan = async (manager: EntityManager, span: RoomSpanDto): Promise<void> => {
  await manager.query(ROOM_LOCK, [span.roomId]);
  const taken = await manager.existsBy(BookingEntity, {
    roomId: span.roomId,
    startsAt: LessThan(span.endsAt),
    endsAt: MoreThan(span.startsAt),
    ...(span.ownId ? { id: Not(span.ownId) } : {}),
  });
  if (taken) {
    rejectOverlap();
  }
};
