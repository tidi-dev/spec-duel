import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NatsClientModule } from '@roombook/backend-common';
import { QueueEnum } from '@roombook/contract';
import { ConfirmationProcessor } from './confirmation.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION }), NatsClientModule],
  providers: [ConfirmationProcessor],
})
export class ConfirmationModule {}
