import { CreateRooms1731200000000 } from './1731200000000-create-rooms';
import { SeedRooms1731200000001 } from './1731200000001-seed-rooms';
import { CreateBookings1731200000002 } from './1731200000002-create-bookings';
import { CreateIdempotencyKeys1731200000003 } from './1731200000003-create-idempotency-keys';

export const migrations = [
  CreateRooms1731200000000,
  SeedRooms1731200000001,
  CreateBookings1731200000002,
  CreateIdempotencyKeys1731200000003,
];
