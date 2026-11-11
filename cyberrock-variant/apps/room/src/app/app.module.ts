import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseEnvSchema, HealthService, TypeOrmConfigService } from '@roombook/backend-common';
import Joi from 'joi';
import { RoomModule } from '../room/room.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: databaseEnvSchema.keys({
        NATS_URL: Joi.string().uri().required(),
      }),
    }),
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
    RoomModule,
  ],
  controllers: [AppController],
  providers: [HealthService],
})
export class AppModule {}
