import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HealthService, redisConnectionConfig } from '@roombook/backend-common';
import Joi from 'joi';
import { ConfirmationModule } from '../confirmation/confirmation.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NATS_URL: Joi.string().uri().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().port().required(),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: redisConnectionConfig(config) }),
    }),
    ConfirmationModule,
  ],
  controllers: [AppController],
  providers: [HealthService],
})
export class AppModule {}
