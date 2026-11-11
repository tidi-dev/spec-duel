import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsServerOptions } from '@roombook/backend-common';
import { ServiceNameEnum } from '@roombook/contract';
import { AppModule } from './app/app.module';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    natsServerOptions(ServiceNameEnum.ROOM),
  );
  app.enableShutdownHooks();
  await app.listen();
};

void bootstrap();
