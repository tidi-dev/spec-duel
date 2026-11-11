import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { DatabaseEnvDto, databaseEnvSchema } from '../config/database-env.schema';
import { BookingEntity } from '../entities/booking.entity';
import { IdempotencyKeyEntity } from '../entities/idempotency-key.entity';
import { RoomEntity } from '../entities/room.entity';
import { migrations } from './migrations';

const { error, value } = databaseEnvSchema.validate(process.env, { allowUnknown: true });
if (error) {
  throw new Error(`Invalid database configuration: ${error.message}`);
}
const env: DatabaseEnvDto = value;

export const dataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  entities: [RoomEntity, BookingEntity, IdempotencyKeyEntity],
  migrations,
  synchronize: false,
});
