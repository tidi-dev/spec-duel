import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthService, NatsClientModule } from '@roombook/backend-common';
import Joi from 'joi';
import { BookingModule } from '../booking/booking.module';
import { HealthController } from '../health/health.controller';
import { RoomModule } from '../room/room.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NATS_URL: Joi.string().uri().required(),
        GATEWAY_PORT: Joi.number().port().required(),
        WEB_ORIGIN: Joi.string().uri().required(),
      }),
    }),
    NatsClientModule,
    RoomModule,
    BookingModule,
  ],
  controllers: [AppController, HealthController],
  providers: [HealthService],
})
export class AppModule {}
