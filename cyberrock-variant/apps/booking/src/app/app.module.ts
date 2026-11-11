import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  databaseEnvSchema,
  HealthService,
  redisConnectionConfig,
  TypeOrmConfigService,
} from '@roombook/backend-common';
import Joi from 'joi';
import { BookingModule } from '../booking/booking.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: databaseEnvSchema.keys({
        NATS_URL: Joi.string().uri().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().port().required(),
      }),
    }),
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: redisConnectionConfig(config) }),
    }),
    BookingModule,
  ],
  controllers: [AppController],
  providers: [HealthService],
})
export class AppModule {}
