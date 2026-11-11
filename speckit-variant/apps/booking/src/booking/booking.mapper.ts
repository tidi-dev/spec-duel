import { BookingEntity } from '@roombook/backend-common';
import { BookingDto } from '@roombook/contract';

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
