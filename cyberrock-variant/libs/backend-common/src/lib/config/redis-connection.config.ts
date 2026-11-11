import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'bullmq';

export const redisConnectionConfig = (config: ConfigService): RedisOptions => ({
  host: config.getOrThrow<string>('REDIS_HOST'),
  port: config.getOrThrow<number>('REDIS_PORT'),
});
