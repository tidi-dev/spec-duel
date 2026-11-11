import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity } from '@roombook/backend-common';
import { QueueEnum } from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ConfirmationQueueProducer } from './confirmation-queue.producer';
import { CreateBookingService } from './create-booking.service';
import { IdempotentBookingRepository } from './idempotent-booking.repository';
import { RoomClient } from './room.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, IdempotencyKeyEntity]),
    BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION }),
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    CreateBookingService,
    BookingRepository,
    IdempotentBookingRepository,
    RoomClient,
    ConfirmationQueueProducer,
  ],
})
export class BookingModule {}
