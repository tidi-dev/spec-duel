import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BookingEntity } from '@roombook/backend-common';
import { ConfirmationStatusEnum } from '@roombook/contract';
import { DataSource } from 'typeorm';
import { isRoomSpanTaken, lockRoom } from './booking-overlap.query';
import { BookingRepository } from './booking.repository';
import { UpdateBookingOutcomeEnum } from './update-booking-result.dto';

jest.mock('./booking-overlap.query');

const BOOKING_ID = '0b9f4a1e-6a55-4a57-9a43-0f6f5a1c2d3e';
const ROOM_ID = '3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10';
const STORED_START = new Date('2030-01-07T09:00:00.000Z');
const STORED_END = new Date('2030-01-07T10:00:00.000Z');
const NEW_END = '2030-01-07T11:00:00.000Z';

const storedBooking = (): BookingEntity =>
  Object.assign(new BookingEntity(), {
    id: BOOKING_ID,
    roomId: ROOM_ID,
    title: 'Weekly sync',
    organizerEmail: 'ada@example.com',
    startsAt: STORED_START,
    endsAt: STORED_END,
    confirmationStatus: ConfirmationStatusEnum.PENDING,
    confirmationAttempts: 0,
    createdAt: new Date('2029-12-01T08:00:00.000Z'),
    updatedAt: new Date('2029-12-01T08:00:00.000Z'),
  });

describe('BookingRepository.update', () => {
  const lockRoomMock = jest.mocked(lockRoom);
  const isRoomSpanTakenMock = jest.mocked(isRoomSpanTaken);
  const returned = Object.assign(storedBooking(), { endsAt: new Date(NEW_END) });
  let repository: BookingRepository;
  let manager: Record<'findOneBy' | 'query', jest.Mock>;
  let queryRunner: Record<
    'connect' | 'startTransaction' | 'commitTransaction' | 'rollbackTransaction' | 'release',
    jest.Mock
  >;

  const expectCommittedOnce = (): void => {
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  };

  beforeEach(async () => {
    lockRoomMock.mockReset().mockResolvedValue(undefined);
    isRoomSpanTakenMock.mockReset().mockResolvedValue(false);
    manager = {
      findOneBy: jest.fn().mockResolvedValue(storedBooking()),
      query: jest.fn().mockResolvedValue([[returned], 1]),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRepository,
        { provide: getRepositoryToken(BookingEntity), useValue: {} },
        { provide: DataSource, useValue: { createQueryRunner: () => ({ ...queryRunner, manager }) } },
      ],
    }).compile();
    repository = moduleRef.get(BookingRepository);
  });

  afterEach(() => expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1));

  it('answers NOT_FOUND without a lock when the booking does not exist', async () => {
    manager.findOneBy.mockResolvedValue(null);

    await expect(repository.update(BOOKING_ID, { title: 'Planning' })).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.NOT_FOUND,
      booking: null,
    });
    expect(lockRoomMock).not.toHaveBeenCalled();
    expectCommittedOnce();
  });

  it('answers NOT_FOUND when the booking is gone after the wait for the lock', async () => {
    manager.findOneBy.mockResolvedValueOnce(storedBooking()).mockResolvedValueOnce(null);

    await expect(repository.update(BOOKING_ID, { title: 'Planning' })).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.NOT_FOUND,
      booking: null,
    });
    expect(isRoomSpanTakenMock).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expectCommittedOnce();
  });

  it.each([
    ['the sent end equals the stored start', { endsAt: '2030-01-07T09:00:00.000Z' }],
    ['the sent start is later than the stored end', { startsAt: '2030-01-07T10:30:00.000Z' }],
  ])('answers INVALID_TIME_RANGE without an overlap check when %s', async (_case, changes) => {
    await expect(repository.update(BOOKING_ID, changes)).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.INVALID_TIME_RANGE,
      booking: null,
    });
    expect(isRoomSpanTakenMock).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expectCommittedOnce();
  });

  it('answers OVERLAP without an update when the resulting span is taken', async () => {
    isRoomSpanTakenMock.mockResolvedValue(true);

    await expect(repository.update(BOOKING_ID, { endsAt: NEW_END })).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.OVERLAP,
      booking: null,
    });
    expect(manager.query).not.toHaveBeenCalled();
    expectCommittedOnce();
  });

  it('checks the resulting span with its own id excluded, then runs the conditional update', async () => {
    await expect(repository.update(BOOKING_ID, { endsAt: NEW_END })).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.UPDATED,
      booking: returned,
    });

    expect(isRoomSpanTakenMock).toHaveBeenCalledWith(manager, ROOM_ID, STORED_START, new Date(NEW_END), BOOKING_ID);
    expect(manager.query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = manager.query.mock.calls[0];
    expect(sql).toMatch(/^UPDATE "bookings"/);
    expect(sql).toContain('"title" = COALESCE($2::varchar, "title")');
    expect(sql).toContain('"starts_at" = COALESCE($3::timestamptz, "starts_at")');
    expect(sql).toContain('"ends_at" = COALESCE($4::timestamptz, "ends_at")');
    expect(sql).toContain('"updated_at" = now()');
    expect(sql).toContain('COALESCE($4::timestamptz, "ends_at") > COALESCE($3::timestamptz, "starts_at")');
    expect(sql).toContain('RETURNING');
    expect(parameters).toEqual([BOOKING_ID, null, null, new Date(NEW_END)]);
    expectCommittedOnce();
  });

  it('locks the room and checks the stored span for a title-only change', async () => {
    await repository.update(BOOKING_ID, { title: 'Planning' });

    expect(lockRoomMock).toHaveBeenCalledWith(manager, ROOM_ID);
    expect(isRoomSpanTakenMock).toHaveBeenCalledWith(manager, ROOM_ID, STORED_START, STORED_END, BOOKING_ID);
    expect(manager.query.mock.calls[0][1]).toEqual([BOOKING_ID, 'Planning', null, null]);
  });

  it('answers NOT_FOUND when the update returns no row', async () => {
    manager.query.mockResolvedValue([[], 0]);

    await expect(repository.update(BOOKING_ID, { title: 'Planning' })).resolves.toEqual({
      outcome: UpdateBookingOutcomeEnum.NOT_FOUND,
      booking: null,
    });
    expectCommittedOnce();
  });

  it('reads, locks the room, reads again, checks the span, then updates', async () => {
    await repository.update(BOOKING_ID, { endsAt: NEW_END });

    expect(manager.findOneBy.mock.calls).toEqual([
      [BookingEntity, { id: BOOKING_ID }],
      [BookingEntity, { id: BOOKING_ID }],
    ]);
    const order = [
      manager.findOneBy.mock.invocationCallOrder[0],
      lockRoomMock.mock.invocationCallOrder[0],
      manager.findOneBy.mock.invocationCallOrder[1],
      isRoomSpanTakenMock.mock.invocationCallOrder[0],
      manager.query.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('rolls back, releases and rethrows when a statement rejects', async () => {
    const failure = new Error('connection terminated');
    manager.query.mockRejectedValue(failure);

    await expect(repository.update(BOOKING_ID, { endsAt: NEW_END })).rejects.toBe(failure);

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
