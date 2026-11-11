import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { RpcExceptionFilter } from '@roombook/backend-common';

export const GATEWAY_GLOBAL_PREFIX = 'api';

export const configureGatewayApp = (app: INestApplication): void => {
  app.setGlobalPrefix(GATEWAY_GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new RpcExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
};
