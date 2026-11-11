import { RpcException } from '@nestjs/microservices';
import { BookingEntity } from '@roombook/backend-common';
import { BookingDto, ConfirmationStatusEnum } from '@roombook/contract';

export const BOOKING_ID = '7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f';
export const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';

export const bookingEntity = (overrides: Partial<BookingEntity> = {}): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: BOOKING_ID,
    roomId: ROOM_ID,
    title: 'Planning',
    organizerEmail: 'ana@example.com',
    startsAt: new Date('2030-01-01T10:00:00.000Z'),
    endsAt: new Date('2030-01-01T11:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2029-12-01T09:00:00.000Z'),
    updatedAt: new Date('2029-12-02T09:00:00.000Z'),
    ...overrides,
  });

export const bookingDto = (overrides: Partial<BookingDto> = {}): BookingDto => ({
  id: BOOKING_ID,
  roomId: ROOM_ID,
  title: 'Planning',
  organizerEmail: 'ana@example.com',
  startsAt: '2030-01-01T10:00:00.000Z',
  endsAt: '2030-01-01T11:00:00.000Z',
  confirmationStatus: ConfirmationStatusEnum.PENDING,
  confirmationAttempts: 0,
  createdAt: '2029-12-01T09:00:00.000Z',
  updatedAt: '2029-12-02T09:00:00.000Z',
  ...overrides,
});

export const rpcErrorOf = async (action: () => unknown): Promise<unknown> => {
  try {
    await action();
  } catch (error) {
    return error instanceof RpcException ? error.getError() : error;
  }
  return undefined;
};
