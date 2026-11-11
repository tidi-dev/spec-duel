import { Paged, Room } from '../support/bookings';
import { get } from '../support/http';

const names = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => `Room ${String(from + index).padStart(2, '0')}`);

describe('GET /rooms with a custom page size', () => {
  it('returns rooms 1 to 5 on page 1 with 5 per page', async () => {
    const result = await get<Paged<Room>>('/rooms?page=1&limit=5');

    expect(result.body.items.map((room) => room.name)).toEqual(names(1, 5));
  });

  it('returns rooms 6 to 10 on page 2 with 5 per page', async () => {
    const result = await get<Paged<Room>>('/rooms?page=2&limit=5');

    expect(result.status).toBe(200);
    expect(result.body.total).toBe(12);
    expect(result.body.items.map((room) => room.name)).toEqual(names(6, 10));
  });

  it('returns rooms 11 and 12 on page 3 with 5 per page', async () => {
    const result = await get<Paged<Room>>('/rooms?page=3&limit=5');

    expect(result.body.items.map((room) => room.name)).toEqual(names(11, 12));
  });

  it('returns rooms 4 to 6 on page 2 with 3 per page', async () => {
    const result = await get<Paged<Room>>('/rooms?page=2&limit=3');

    expect(result.body.items.map((room) => room.name)).toEqual(names(4, 6));
  });
});
