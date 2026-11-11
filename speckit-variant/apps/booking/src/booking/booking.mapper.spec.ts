import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { toBookingDto } from './booking.mapper';

describe('toBookingDto', () => {
  it('answers every booking field in camelCase with ISO date-times', () => {
    const entity: BookingEntity = Object.assign(new BookingEntity(), {
      id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
      roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
      title: 'Weekly sync',
      organizerEmail: 'ada@example.com',
      startsAt: new Date('2030-01-07T09:00:00.000Z'),
      endsAt: new Date('2030-01-07T10:00:00.000Z'),
      confirmationStatus: ConfirmationStatusEnum.PENDING,
      confirmationAttempts: 0,
      createdAt: new Date('2029-12-01T08:00:00.000Z'),
      updatedAt: new Date('2029-12-02T08:30:00.000Z'),
    });

    expect(toBookingDto(entity)).toEqual({
      id: '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e',
      roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
      title: 'Weekly sync',
      organizerEmail: 'ada@example.com',
      startsAt: '2030-01-07T09:00:00.000Z',
      endsAt: '2030-01-07T10:00:00.000Z',
      confirmationStatus: 'PENDING',
      confirmationAttempts: 0,
      createdAt: '2029-12-01T08:00:00.000Z',
      updatedAt: '2029-12-02T08:30:00.000Z',
    });
  });
});
