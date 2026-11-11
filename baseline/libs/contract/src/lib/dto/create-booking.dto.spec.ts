import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

const validBody = {
  roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
  title: 'Sprint planning',
  organizerEmail: 'organizer@example.com',
  startsAt: '2030-01-07T09:00:00.000Z',
  endsAt: '2030-01-07T10:00:00.000Z',
};

const errorsFor = async (plain: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(CreateBookingDto, plain));
  return errors.map((error) => error.property);
};

describe('CreateBookingDto', () => {
  it('accepts a valid body', async () => {
    expect(await errorsFor(validBody)).toEqual([]);
  });

  it.each([
    ['roomId', 'not-a-uuid'],
    ['title', ''],
    ['title', 'x'.repeat(121)],
    ['organizerEmail', 'not-an-email'],
    ['startsAt', '07/01/2030 09:00'],
    ['endsAt', 'tomorrow'],
  ])('rejects an invalid %s', async (property, value) => {
    expect(await errorsFor({ ...validBody, [property]: value })).toEqual([property]);
  });

  it('rejects a missing field', async () => {
    expect(await errorsFor({ ...validBody, title: undefined })).toEqual(['title']);
  });
});
