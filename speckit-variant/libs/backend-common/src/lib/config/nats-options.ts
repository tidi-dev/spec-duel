import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ServiceNameEnum } from '@roombook/contract';

export const natsServerOptions = (service: ServiceNameEnum): MicroserviceOptions => ({
  transport: Transport.NATS,
  options: { servers: process.env['NATS_URL'], queue: service },
});
