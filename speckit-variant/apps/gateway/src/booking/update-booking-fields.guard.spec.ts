import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { UpdateBookingFieldsGuard } from './update-booking-fields.guard';

const contextWithBody = (body: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ body }) }) }) as unknown as ExecutionContext;

describe('UpdateBookingFieldsGuard', () => {
  const guard = new UpdateBookingFieldsGuard();

  it.each([
    ['an empty body', {}],
    ['no body', undefined],
    ['the three updatable fields', { title: 'Planning', startsAt: '2030-01-07T09:00:00.000Z', endsAt: '2030-01-07T10:00:00.000Z' }],
  ])('allows %s', async (_case, body) => {
    await expect(guard.canActivate(contextWithBody(body))).resolves.toBe(true);
  });

  it.each([
    ['roomId', '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10'],
    ['organizerEmail', 'ada@example.com'],
    ['unknown', 'x'],
  ])('rejects the field %s', async (field, value) => {
    await expect(guard.canActivate(contextWithBody({ title: 'Planning', [field]: value }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
