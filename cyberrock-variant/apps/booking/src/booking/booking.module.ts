import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingEntity, IdempotencyKeyEntity, NatsClientModule } from '@roombook/backend-common';
import { QueueEnum } from '@roombook/contract';
import { BookingController } from './booking.controller';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ConfirmationProducer } from './confirmation.producer';
import { IdempotentBookingRepository } from './idempotent-booking.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, IdempotencyKeyEntity]),
    BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION }),
    NatsClientModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository, IdempotentBookingRepository, ConfirmationProducer],
})
export class BookingModule {}
