import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { DataSource, LessThan, MoreThan, Not } from 'typeorm';
import { BookingRepository } from './booking.repository';
import { UpdateBookingCommand } from './dto/update-booking.command';
import { UpdateBookingOutcomeKindEnum } from './dto/update-booking-outcome';
import { BOOKING_ID, bookingDto, bookingEntity, ROOM_ID } from './testing/booking.fixture';

describe('BookingRepository.update', () => {
  const command: UpdateBookingCommand = {
    id: BOOKING_ID,
    title: 'Retro',
    startsAt: new Date('2030-01-02T10:00:00.000Z'),
    endsAt: new Date('2030-01-02T11:00:00.000Z'),
  };
  const { id, ...values } = command;
  let repository: BookingRepository;
  let transaction: jest.Mock;
  let manager: Record<'findOneBy' | 'query' | 'existsBy' | 'update' | 'findOneByOrFail', jest.Mock>;

  beforeEach(async () => {
    manager = {
      findOneBy: jest.fn().mockResolvedValue(bookingEntity()),
      query: jest.fn().mockResolvedValue([]),
      existsBy: jest.fn().mockResolvedValue(false),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneByOrFail: jest.fn().mockResolvedValue(bookingEntity(values)),
    };
    transaction = jest.fn((work: (entityManager: typeof manager) => unknown) => work(manager));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: DataSource, useValue: { transaction } },
        { provide: getRepositoryToken(BookingEntity), useValue: {} },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  it('updates the title and times in one transaction and answers the stored booking', async () => {
    const outcome = await repository.update(command);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOneBy).toHaveBeenCalledWith(BookingEntity, { id });
    expect(manager.update).toHaveBeenCalledWith(BookingEntity, { id }, values);
    expect(manager.findOneByOrFail).toHaveBeenCalledWith(BookingEntity, { id });
    expect(outcome).toEqual({
      kind: UpdateBookingOutcomeKindEnum.UPDATED,
      booking: bookingDto({ title: 'Retro', startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-02T11:00:00.000Z' }),
    });
  });

  it('checks the new span in the stored room, leaving the booking itself out', async () => {
    await repository.update(command);

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      `booking-room:${ROOM_ID}`,
    ]);
    expect(manager.existsBy).toHaveBeenCalledWith(BookingEntity, {
      roomId: ROOM_ID,
      startsAt: LessThan(command.endsAt),
      endsAt: MoreThan(command.startsAt),
      id: Not(BOOKING_ID),
    });
  });

  it('reads the booking, locks the room, checks overlap, writes and reads again, in that order', async () => {
    await repository.update(command);

    const order = [manager.findOneBy, manager.query, manager.existsBy, manager.update, manager.findOneByOrFail].map(
      (mock) => mock.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('answers not found without a lock or a write for an unknown id', async () => {
    manager.findOneBy.mockResolvedValue(null);

    await expect(repository.update(command)).resolves.toEqual({ kind: UpdateBookingOutcomeKindEnum.NOT_FOUND });
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.existsBy).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('answers overlap without a write when another booking of the room takes the span', async () => {
    manager.existsBy.mockResolvedValue(true);

    await expect(repository.update(command)).resolves.toEqual({ kind: UpdateBookingOutcomeKindEnum.OVERLAP });
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.findOneByOrFail).not.toHaveBeenCalled();
  });

  it('answers not found when the write affects no row', async () => {
    manager.update.mockResolvedValue({ affected: 0 });

    await expect(repository.update(command)).resolves.toEqual({ kind: UpdateBookingOutcomeKindEnum.NOT_FOUND });
    expect(manager.findOneByOrFail).not.toHaveBeenCalled();
  });
});
