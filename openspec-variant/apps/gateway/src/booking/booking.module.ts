import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { IdempotencyKeyGuard } from './idempotency-key.guard';
import { IdempotencyReplayedInterceptor } from './idempotency-replayed.interceptor';

@Module({
  controllers: [BookingController],
  providers: [IdempotencyKeyGuard, IdempotencyReplayedInterceptor],
})
export class BookingModule {}
