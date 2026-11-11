import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { QueueEnum } from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomLookupClient } from './room-lookup.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, IdempotencyKeyEntity]),
    BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION }),
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingValidator,
    BookingRepository,
    IdempotentBookingRepository,
    RoomLookupClient,
    ConfirmationQueueProducer,
  ],
})
export class BookingModule {}
