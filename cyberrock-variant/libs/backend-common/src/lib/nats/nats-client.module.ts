import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProvider, ClientsModule, Transport } from '@nestjs/microservices';

export const NATS_CLIENT = 'NATS';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NATS_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService): ClientProvider => ({
          transport: Transport.NATS,
          options: { servers: config.getOrThrow<string>('NATS_URL') },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class NatsClientModule {}
