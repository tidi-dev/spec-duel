import { BookingEntity } from '@roombook/backend-common';
import { BookingDto } from '@roombook/contract';

export class BookingMapper {
  static toDto(entity: BookingEntity): BookingDto {
    return {
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
    };
  }
}
