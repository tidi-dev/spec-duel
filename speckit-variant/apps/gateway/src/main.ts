import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureGatewayApp } from './app/configure-gateway-app';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureGatewayApp(app);
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') });
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('GATEWAY_PORT'));
};

void bootstrap();
