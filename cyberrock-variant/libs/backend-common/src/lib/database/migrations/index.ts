import { CreateRooms1731200000000 } from './1731200000000-create-rooms';
import { SeedRooms1731200000001 } from './1731200000001-seed-rooms';
import { CreateBookings1731300000000 } from './1731300000000-create-bookings';
import { AddBookingsOverlapExclusion1731400000000 } from './1731400000000-add-bookings-overlap-exclusion';

export const migrations = [
  CreateRooms1731200000000,
  SeedRooms1731200000001,
  CreateBookings1731300000000,
  AddBookingsOverlapExclusion1731400000000,
];
