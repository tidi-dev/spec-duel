import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueEnum } from '@roombook/contract';
import { BookingClient } from './booking.client';
import { ConfirmationProcessor } from './confirmation.processor';
import { ConfirmationService } from './confirmation.service';
import { SimulatedConfirmationSender } from './simulated-confirmation.sender';

@Module({
  imports: [BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION })],
  providers: [ConfirmationProcessor, ConfirmationService, SimulatedConfirmationSender, BookingClient],
})
export class ConfirmationModule {}
