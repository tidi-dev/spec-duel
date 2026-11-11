import { RpcException } from '@nestjs/microservices';
import { BookingEntity } from '@roombook/backend-common';
import { ErrorCodeEnum } from '@roombook/contract';
import { EntityManager, LessThan, MoreThan, Not } from 'typeorm';
import { rejectOverlap, requireFreeSpan, RoomSpanDto } from './booking-overlap';

const R1 = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const OWN_ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';
const OVERLAP = {
  statusCode: 409,
  errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
  message: 'The room is already booked in that time span',
};

const createSpan: RoomSpanDto = {
  roomId: R1,
  startsAt: new Date('2030-01-07T09:30:00.000Z'),
  endsAt: new Date('2030-01-07T10:30:00.000Z'),
};
const updateSpan: RoomSpanDto = { ...createSpan, ownId: OWN_ID };

const rpcErrorOf = async (work: () => unknown): Promise<unknown> => {
  try {
    await work();
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    return (error as RpcException).getError();
  }
  throw new Error('Expected a rejection');
};

describe('requireFreeSpan (BKG-012)', () => {
  const query = jest.fn();
  const existsBy = jest.fn();
  const manager = { query, existsBy } as unknown as EntityManager;

  beforeEach(() => {
    jest.resetAllMocks();
    existsBy.mockResolvedValue(false);
  });

  it('takes the waiting transaction lock of the room before it looks for an overlap (BKG-015)', async () => {
    await requireFreeSpan(manager, createSpan);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(`SELECT pg_advisory_xact_lock(hashtextextended('room:' || $1, 0))`, [R1]);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(existsBy.mock.invocationCallOrder[0]);
  });

  it('asks for a booking of the same room that starts before the end and ends after the start (create)', async () => {
    await expect(requireFreeSpan(manager, createSpan)).resolves.toBeUndefined();

    expect(existsBy).toHaveBeenCalledTimes(1);
    expect(existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: R1,
      startsAt: LessThan(createSpan.endsAt),
      endsAt: MoreThan(createSpan.startsAt),
    });
  });

  it('leaves the booking itself out of the question (update, BKG-014)', async () => {
    await expect(requireFreeSpan(manager, updateSpan)).resolves.toBeUndefined();

    expect(existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: R1,
      startsAt: LessThan(updateSpan.endsAt),
      endsAt: MoreThan(updateSpan.startsAt),
      id: Not(OWN_ID),
    });
  });

  it.each([
    ['create', createSpan],
    ['update', updateSpan],
  ])('answers 409 CONFLICT.BOOKING_OVERLAP when such a booking exists (%s, R-11)', async (_caller, span) => {
    existsBy.mockResolvedValue(true);

    await expect(rpcErrorOf(() => requireFreeSpan(manager, span))).resolves.toEqual(OVERLAP);
  });

  it('gives the constraint mapping the same 409 (BKG-016)', async () => {
    await expect(rpcErrorOf(rejectOverlap)).resolves.toEqual(OVERLAP);
  });
});
