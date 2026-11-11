import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { IdempotencyKeyGuard } from './idempotency-key.guard';
import { IdempotencyReplayInterceptor } from './idempotency-replay.interceptor';
import { UpdateBookingFieldsGuard } from './update-booking-fields.guard';

@Module({
  controllers: [BookingController],
  providers: [IdempotencyReplayInterceptor, IdempotencyKeyGuard, UpdateBookingFieldsGuard],
})
export class BookingModule {}
