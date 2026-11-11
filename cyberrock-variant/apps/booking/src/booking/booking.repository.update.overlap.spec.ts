import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum, ErrorCodeEnum } from '@roombook/contract';
import { DataSource, LessThan, MoreThan, Not, QueryFailedError } from 'typeorm';
import { BookingChangesDto } from './booking-input';
import { BookingRepository } from './booking.repository';

const ID = '9d0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a99';

const entity = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: ID,
    roomId: '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10',
    title: 'Sprint planning',
    organizerEmail: 'ann@example.com',
    startsAt: new Date('2030-01-07T09:00:00.000Z'),
    endsAt: new Date('2030-01-07T10:00:00.000Z'),
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  });

describe('BookingRepository update and the overlap rule (BKG-014)', () => {
  let repository: BookingRepository;
  const manager = {
    findOne: jest.fn(),
    query: jest.fn(),
    existsBy: jest.fn(),
    update: jest.fn(),
    findOneByOrFail: jest.fn(),
  };
  const transaction = jest.fn();
  const overlap = {
    statusCode: 409,
    errorCode: ErrorCodeEnum.BOOKING_OVERLAP,
    message: 'The room is already booked in that time span',
  };
  const overlapOf = async (changes: BookingChangesDto): Promise<unknown> => {
    const error = await repository.update(ID, changes).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RpcException);
    return (error as RpcException).getError();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((work: (transactionManager: typeof manager) => unknown) => work(manager));
    manager.existsBy.mockResolvedValue(false);
    manager.findOne.mockResolvedValue(entity());
    manager.findOneByOrFail.mockResolvedValue(entity());
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: getRepositoryToken(BookingEntity), useValue: {} },
        { provide: DataSource, useValue: { transaction } },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  it('takes no room lock and runs no check for a title-only patch', async () => {
    manager.existsBy.mockResolvedValue(true);

    await expect(repository.update(ID, { title: 'Retro' })).resolves.toMatchObject({ id: ID });
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.existsBy).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(BookingEntity, { id: ID }, { title: 'Retro' });
  });

  it('runs no check when the patch repeats the stored span', async () => {
    await repository.update(ID, { startsAt: entity().startsAt, endsAt: entity().endsAt });

    expect(manager.existsBy).not.toHaveBeenCalled();
  });

  it.each([
    ['a new start with the stored end', { startsAt: new Date('2030-01-07T08:00:00.000Z') }, '08:00', '10:00'],
    ['the stored start with a new end', { endsAt: new Date('2030-01-07T11:00:00.000Z') }, '09:00', '11:00'],
    [
      'a new start and a new end',
      { startsAt: new Date('2030-01-07T08:30:00.000Z'), endsAt: new Date('2030-01-07T09:30:00.000Z') },
      '08:30',
      '09:30',
    ],
  ])('locks the row, then the room, and checks %s without itself before writing', async (_case, changes, from, to) => {
    await repository.update(ID, changes);

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [entity().roomId]);
    expect(manager.existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: entity().roomId,
      startsAt: LessThan(new Date(`2030-01-07T${to}:00.000Z`)),
      endsAt: MoreThan(new Date(`2030-01-07T${from}:00.000Z`)),
      id: Not(ID),
    });
    const order = [manager.findOne, manager.query, manager.existsBy, manager.update].map(
      (mock) => mock.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((first, second) => first - second));
  });

  it('answers 409 CONFLICT.BOOKING_OVERLAP and writes nothing when the merged span is taken', async () => {
    manager.existsBy.mockResolvedValue(true);

    await expect(overlapOf({ startsAt: new Date('2030-01-07T08:59:59.999Z') })).resolves.toEqual(overlap);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('maps an EXCL_bookings_room_span violation to the same 409 (BKG-016)', async () => {
    manager.update.mockRejectedValue(
      new QueryFailedError('UPDATE', [], Object.assign(new Error('x'), { constraint: 'EXCL_bookings_room_span' })),
    );

    await expect(overlapOf({ endsAt: new Date('2030-01-07T11:00:00.000Z') })).resolves.toEqual(overlap);
  });
});
